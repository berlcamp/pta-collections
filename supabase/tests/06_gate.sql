-- 06_gate.sql — the RFID attendance gate, as PTA Collections sees it.
--
-- Covers migration 0013's write path (record_attendance, the resolved view) and
-- 0015's admin surface (the local-date view, the enrolment queue, and the two
-- card RPCs). The interesting cases are all about HISTORY: a card is a piece of
-- plastic that changes hands, and every assertion below exists because some
-- obvious-looking implementation would quietly rewrite the past.

\set A_ADMIN   '''22222222-2222-2222-2222-222222222222'''
\set A_CASHIER '''33333333-3333-3333-3333-333333333333'''
\set B_ADMIN   '''55555555-5555-5555-5555-555555555555'''
\set SUPER     '''11111111-1111-1111-1111-111111111111'''

-- ---------------------------------------------------------------------------
-- Setup: one reader per school.
-- ---------------------------------------------------------------------------
select pta_test.login(:A_ADMIN::uuid);

insert into pta.gate_devices (device_id, school_id, label, created_by)
select 'onhs-main-gate', id, 'Main gate', pta.current_profile_id()
from pta.schools where school_code = 'ONHS';

select pta_test.eq((select count(*) from pta.gate_devices)::int, 1,
  'GA1. An admin can register a gate device');
select pta_test.logout();

select pta_test.login(:B_ADMIN::uuid);
insert into pta.gate_devices (device_id, school_id, label, created_by)
select 'tnhs-main-gate', id, 'Main gate', pta.current_profile_id()
from pta.schools where school_code = 'TNHS';
select pta_test.logout();

-- A cashier does not get to decide which readers are trusted.
select pta_test.login(:A_CASHIER::uuid);
select pta_test.throws($$
  insert into pta.gate_devices (device_id, school_id)
  select 'rogue-reader', id from pta.schools where school_code = 'ONHS'
$$, 'GA2. A cashier cannot register a gate device');
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- record_attendance — the one verb the device holds
-- ---------------------------------------------------------------------------
select pta_test.login(:A_ADMIN::uuid);

-- Three taps of a card nobody owns yet, plus one synthetic id of the sort the
-- firmware's `burst` console command mints when load-testing the queue.
select pta.record_attendance($$[
  {"event_id":"aaaaaaa1-0000-0000-0000-000000000001","device_id":"onhs-main-gate",
   "card_uid":"a1b2c3d4","scanned_at":"2026-06-14T23:10:00Z","clock_synced":true},
  {"event_id":"aaaaaaa1-0000-0000-0000-000000000002","device_id":"onhs-main-gate",
   "card_uid":"A1B2C3D4","scanned_at":"2026-06-15T23:30:00Z","clock_synced":true},
  {"event_id":"aaaaaaa1-0000-0000-0000-000000000003","device_id":"onhs-main-gate",
   "card_uid":"DEADBEEF","scanned_at":"2026-06-15T23:35:00Z","clock_synced":false,"queued":true},
  {"event_id":"aaaaaaa1-0000-0000-0000-000000000004","device_id":"onhs-main-gate",
   "card_uid":"B0000001","scanned_at":"2026-06-15T23:40:00Z","clock_synced":true}
]$$::jsonb);

select pta_test.eq((select count(*) from pta.attendance)::int, 4,
  'GA3. record_attendance appends a batch');

-- The device sends no school_id at all; the registry decides.
select pta_test.eq(
  (select count(distinct school_id) from pta.attendance
    where school_id = (select id from pta.schools where school_code = 'ONHS'))::int,
  1, 'GA4. school_id is stamped from the device registry, never the request');

-- Lowercase in, uppercase stored — otherwise a hand-typed uid never matches
-- its own scans.
select pta_test.eq(
  (select card_uid from pta.attendance
    where event_id = 'aaaaaaa1-0000-0000-0000-000000000001'),
  'A1B2C3D4', 'GA5. Card UIDs are normalised to uppercase on the way in');

-- A replayed batch is a no-op: event_id is the primary key.
select pta_test.eq(pta.record_attendance($$[
  {"event_id":"aaaaaaa1-0000-0000-0000-000000000001","device_id":"onhs-main-gate",
   "card_uid":"A1B2C3D4","scanned_at":"2026-06-14T23:10:00Z"}
]$$::jsonb), 0, 'GA6. Replaying a delivered batch inserts nothing');

-- An unregistered device RAISES rather than silently dropping the events: the
-- device queues through anything it cannot deliver, so raising preserves them.
select pta_test.throws($t$
  select pta.record_attendance($j$[
    {"event_id":"aaaaaaa1-0000-0000-0000-000000000009","device_id":"not-registered",
     "card_uid":"CAFE0001","scanned_at":"2026-06-15T23:45:00Z"}
  ]$j$::jsonb)
$t$, 'GA7. An unregistered device is rejected, not silently dropped');

-- ---------------------------------------------------------------------------
-- v_attendance_local — the day boundary is Manila's, computed in SQL (D11)
-- ---------------------------------------------------------------------------
select pta_test.eq(
  (select local_date from pta.v_attendance_local
    where event_id = 'aaaaaaa1-0000-0000-0000-000000000002'),
  date '2026-06-16',
  'GA8. 23:30 UTC is the NEXT school day in Asia/Manila');

select pta_test.eq(
  (select local_date from pta.v_attendance_local
    where event_id = 'aaaaaaa1-0000-0000-0000-000000000001'),
  date '2026-06-15',
  'GA9. 23:10 UTC on the 14th is the 15th locally');

-- ---------------------------------------------------------------------------
-- The enrolment queue
-- ---------------------------------------------------------------------------
select pta_test.eq(
  (select count(*) from pta.v_unassigned_cards)::int, 2,
  'GA10. Unowned cards queue for enrolment');

select pta_test.ok(
  not exists (select 1 from pta.v_unassigned_cards where card_uid = 'B0000001'),
  'GA11. Synthetic load-test UIDs stay out of the enrolment queue');

select pta_test.eq(
  (select scan_count from pta.v_unassigned_cards where card_uid = 'A1B2C3D4')::int,
  2, 'GA12. The queue counts every tap of a card, not just the last');

-- ---------------------------------------------------------------------------
-- assign_student_card
-- ---------------------------------------------------------------------------
select pta.assign_student_card(
  (select st.id from pta.students st join pta.schools s on s.id = st.school_id
    where s.school_code = 'ONHS' and st.first_name = 'Juan'),
  'a1b2c3d4');   -- lowercase on purpose: the operator read it off the card

select pta_test.eq(
  (select card_uid from pta.student_cards where revoked_at is null),
  'A1B2C3D4', 'GA13. A hand-typed lowercase UID is normalised before storage');

select pta_test.ok(
  not exists (select 1 from pta.v_unassigned_cards where card_uid = 'A1B2C3D4'),
  'GA14. An assigned card leaves the enrolment queue');

-- The whole point of issue/revoke windows: scans from BEFORE the card was
-- issued must not be retconned onto its new holder.
select pta_test.ok(
  (select student_id from pta.attendance_resolved
    where event_id = 'aaaaaaa1-0000-0000-0000-000000000001') is null,
  'GA15. Scans predating the card keep resolving to nobody');

-- A tap now, after issuance, resolves to the holder. Stamped with now()
-- rather than a literal: psql autocommits, so issue < this scan < the reissue
-- below is a real ordering and not a hopeful one.
select pta.record_attendance(jsonb_build_array(jsonb_build_object(
  'event_id',   'aaaaaaa1-0000-0000-0000-000000000010',
  'device_id',  'onhs-main-gate',
  'card_uid',   'A1B2C3D4',
  'scanned_at', now(),
  'clock_synced', true)));

select pta_test.eq(
  (select full_name from pta.attendance_resolved
    where event_id = 'aaaaaaa1-0000-0000-0000-000000000010'),
  'Cruz, Juan Dela',
  'GA16. A tap after issuance resolves to the card holder');

-- Idempotent: assigning the same card to the same student again must not mint
-- a second row, because a fresh issued_at would orphan its own scans.
select pta_test.eq(
  (select count(*) from pta.student_cards
    where card_uid = 'A1B2C3D4' and revoked_at is null)::int,
  1, 'GA17. Re-assigning a card to its current holder changes nothing');

-- Reassignment: the incumbent is retired, not overwritten.
select pta.assign_student_card(
  (select st.id from pta.students st join pta.schools s on s.id = st.school_id
    where s.school_code = 'ONHS' and st.first_name = 'Pedro'),
  'A1B2C3D4');

select pta_test.eq(
  (select count(*) from pta.student_cards where card_uid = 'A1B2C3D4')::int,
  2, 'GA18. Reassigning a card retires the old row and issues a new one');

select pta_test.eq(
  (select count(*) from pta.student_cards
    where card_uid = 'A1B2C3D4' and revoked_at is null)::int,
  1, 'GA19. Only one holder of a card is ever active');

select pta_test.eq(
  (select full_name from pta.attendance_resolved
    where event_id = 'aaaaaaa1-0000-0000-0000-000000000010'),
  'Cruz, Juan Dela',
  'GA20. Past attendance still names whoever actually held the card that day');

-- ...while a tap after the handover names the new holder.
select pta.record_attendance(jsonb_build_array(jsonb_build_object(
  'event_id',   'aaaaaaa1-0000-0000-0000-000000000011',
  'device_id',  'onhs-main-gate',
  'card_uid',   'A1B2C3D4',
  'scanned_at', now(),
  'clock_synced', true)));

select pta_test.eq(
  (select full_name from pta.attendance_resolved
    where event_id = 'aaaaaaa1-0000-0000-0000-000000000011'),
  'Reyes, Pedro Santos',
  'GA20b. A tap after the handover names the new holder');

select pta_test.eq(
  (select count(*) from pta.audit_logs where action = 'CARD_ASSIGNED')::int,
  2, 'GA21. Card assignment is audited');

-- ---------------------------------------------------------------------------
-- v_student_cards_detail / v_gate_device_status
-- ---------------------------------------------------------------------------
select pta_test.eq(
  (select student_name from pta.v_student_cards_detail
    where card_uid = 'A1B2C3D4' and revoked_at is null),
  'Reyes, Pedro Santos',
  'GA22. Issued cards carry the holder''s name');

select pta_test.eq(
  (select device_id from pta.v_gate_device_status
    where school_id = (select id from pta.schools where school_code = 'ONHS')),
  'onhs-main-gate', 'GA23. Device status lists this school''s readers');

select pta_test.ok(
  (select last_scan_at from pta.v_gate_device_status
    where device_id = 'onhs-main-gate') is not null,
  'GA24. Device status reports when the reader was last heard from');

-- ---------------------------------------------------------------------------
-- revoke_student_card
-- ---------------------------------------------------------------------------
select pta.revoke_student_card(
  (select id from pta.student_cards where card_uid = 'A1B2C3D4' and revoked_at is null));

select pta_test.eq(
  (select count(*) from pta.student_cards
    where card_uid = 'A1B2C3D4' and revoked_at is null)::int,
  0, 'GA25. Revoking retires the card');

select pta_test.eq(
  (select full_name from pta.attendance_resolved
    where event_id = 'aaaaaaa1-0000-0000-0000-000000000010'),
  'Cruz, Juan Dela',
  'GA26. Revoking rewrites no attendance at all');

select pta_test.eq(
  (select full_name from pta.attendance_resolved
    where event_id = 'aaaaaaa1-0000-0000-0000-000000000011'),
  'Reyes, Pedro Santos',
  'GA26b. ...including the retired holder''s own scans');

select pta_test.eq(
  (select count(*) from pta.v_unassigned_cards where card_uid = 'A1B2C3D4')::int,
  1, 'GA27. A retired card returns to the enrolment queue');

-- A double-click is not an error.
select pta.revoke_student_card(
  (select id from pta.student_cards where card_uid = 'A1B2C3D4' and revoked_at is not null
   order by issued_at desc limit 1));
select pta_test.eq(
  (select count(*) from pta.audit_logs where action = 'CARD_REVOKED')::int,
  1, 'GA28. Revoking an already-retired card is a no-op, not a second audit row');

select pta_test.logout();

-- ---------------------------------------------------------------------------
-- Authorization
-- ---------------------------------------------------------------------------
select pta_test.login(:A_CASHIER::uuid);
select pta_test.throws($$
  select pta.assign_student_card(
    (select st.id from pta.students st join pta.schools s on s.id = st.school_id
      where s.school_code = 'ONHS' and st.first_name = 'Maria'),
    'DEADBEEF')
$$, 'GA29. A cashier cannot bind a card to a student');
select pta_test.logout();

-- Cross-tenant: School B's admin has no business touching School A's students,
-- and the school is taken from the STUDENT, so there is nothing to spoof.
select pta_test.login(:B_ADMIN::uuid);
select pta_test.throws($$
  select pta.assign_student_card(
    (select st.id from pta.students st join pta.schools s on s.id = st.school_id
      where s.school_code = 'ONHS' and st.first_name = 'Maria'),
    'DEADBEEF')
$$, 'GA30. Another school''s admin cannot enrol a card to your student');

select pta_test.eq((select count(*) from pta.attendance)::int, 0,
  'GA31. School B sees none of School A''s scans');
select pta_test.eq((select count(*) from pta.v_unassigned_cards)::int, 0,
  'GA32. School B sees none of School A''s unassigned cards');
select pta_test.eq((select count(*) from pta.v_student_cards_detail)::int, 0,
  'GA33. School B sees none of School A''s issued cards');
select pta_test.eq((select count(*) from pta.v_gate_device_status)::int, 1,
  'GA34. School B sees only its own reader');
select pta_test.logout();

-- A super admin may enrol in any school, and the audit row records that they
-- were acting without a membership.
select pta_test.login(:SUPER::uuid);
select pta.assign_student_card(
  (select st.id from pta.students st join pta.schools s on s.id = st.school_id
    where s.school_code = 'ONHS' and st.first_name = 'Maria'),
  'DEADBEEF');

select pta_test.ok(
  (select acting_as_super_admin from pta.audit_logs
    where action = 'CARD_ASSIGNED' order by created_at desc limit 1),
  'GA35. A super admin''s card assignment is stamped acting_as_super_admin');
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- Bad input
-- ---------------------------------------------------------------------------
select pta_test.login(:A_ADMIN::uuid);
select pta_test.throws($$
  select pta.assign_student_card(
    (select st.id from pta.students st join pta.schools s on s.id = st.school_id
      where s.school_code = 'ONHS' and st.first_name = 'Juan'),
    'not-hex')
$$, 'GA36. A UID that is not hexadecimal is refused');
select pta_test.throws($$
  select pta.assign_student_card('00000000-0000-0000-0000-000000000000'::uuid, 'CAFE1234')
$$, 'GA37. A card cannot be bound to a student who does not exist');
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- anon: one append-only verb, and nothing else
-- ---------------------------------------------------------------------------
select pta_test.ok(
  has_function_privilege('anon', 'pta.record_attendance(jsonb)', 'execute'),
  'GA38. anon CAN record attendance — the device key''s single verb');
select pta_test.ok(
  not has_table_privilege('anon', 'pta.attendance', 'select'),
  'GA39. anon cannot read attendance');
select pta_test.ok(
  not has_table_privilege('anon', 'pta.v_attendance_local', 'select'),
  'GA40. anon cannot read the local-date attendance view');
select pta_test.ok(
  not has_table_privilege('anon', 'pta.v_unassigned_cards', 'select'),
  'GA41. anon cannot read the enrolment queue');
select pta_test.ok(
  not has_table_privilege('anon', 'pta.v_student_cards_detail', 'select'),
  'GA42. anon cannot read issued cards');
select pta_test.ok(
  not has_function_privilege('anon', 'pta.assign_student_card(uuid, text)', 'execute'),
  'GA43. anon cannot bind a card to a student');
select pta_test.ok(
  not has_function_privilege('anon', 'pta.revoke_student_card(uuid)', 'execute'),
  'GA44. anon cannot retire a card');
