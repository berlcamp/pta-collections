-- 09_attendance.sql — the attendance summaries behind Reports → Attendance and
-- the Attendance tab on a student's page (migration 0024).
--
-- Every assertion here exists because the obvious implementation gets it wrong
-- in a way nobody notices: counting taps instead of children, bucketing a
-- 23:00Z tap onto the previous day, dropping the students who were never seen
-- (the only rows worth reading), or reporting a missing card as an absence.

\set A_ADMIN   '''22222222-2222-2222-2222-222222222222'''
\set A_CASHIER '''33333333-3333-3333-3333-333333333333'''
\set B_ADMIN   '''55555555-5555-5555-5555-555555555555'''

-- ---------------------------------------------------------------------------
-- Setup.
--
-- One more student, enrolled and cardless, because a school always has some:
-- they are the case the report has to keep separate from a genuine absence.
--
-- 06_gate issued its cards at now(), which puts them in September. Backdate
-- the two this file uses to the start of the school year, because that is when
-- a school hands out cards -- and because attendance_resolved refuses to
-- attribute a tap to a card that did not exist yet. Without this the August
-- scans below would resolve to nobody and every assertion would pass on an
-- empty set.
-- ---------------------------------------------------------------------------
select pta_test.login(:A_ADMIN::uuid);

insert into pta.students (school_id, lrn, first_name, last_name, sex, created_by)
select s.id, '123456789099', 'Ana', 'Nolasco', 'F', pta.current_profile_id()
from pta.schools s where s.school_code = 'ONHS';

insert into pta.student_enrollments
  (school_id, student_id, school_year_id, section_id, grade_level, student_number, created_by)
select st.school_id, st.id, sy.id, sec.id, 'Grade 7', '2026-099', pta.current_profile_id()
from pta.students st
join pta.schools s       on s.id = st.school_id
join pta.school_years sy on sy.school_id = s.id and sy.name = '2026-2027'
join pta.sections sec    on sec.school_year_id = sy.id
where s.school_code = 'ONHS' and st.first_name = 'Ana';

update pta.student_cards
   set issued_at = '2026-06-01T08:00:00+08:00'
 where card_uid in ('CAFE0011', 'DEADBEEF')
   and revoked_at is null;

-- Juan holds CAFE0011 and Maria DEADBEEF, both live, both issued by 06_gate.
--   Aug 3: Juan twice (07:00 is 23:00Z on Aug 2), Maria once  -> 2 students
--   Aug 4: Juan once                                          -> 1 student
--   Aug 5: plastic nobody holds, twice                        -> 0 students
select pta.record_attendance($$[
  {"event_id":"bbbbbbb1-0000-0000-0000-000000000001","device_id":"onhs-main-gate",
   "card_uid":"CAFE0011","scanned_at":"2026-08-03T07:00:00+08:00","clock_synced":true},
  {"event_id":"bbbbbbb1-0000-0000-0000-000000000002","device_id":"onhs-main-gate",
   "card_uid":"CAFE0011","scanned_at":"2026-08-03T12:30:00+08:00","clock_synced":true},
  {"event_id":"bbbbbbb1-0000-0000-0000-000000000003","device_id":"onhs-main-gate",
   "card_uid":"DEADBEEF","scanned_at":"2026-08-03T07:05:00+08:00","clock_synced":true},
  {"event_id":"bbbbbbb1-0000-0000-0000-000000000004","device_id":"onhs-main-gate",
   "card_uid":"CAFE0011","scanned_at":"2026-08-04T07:10:00+08:00","clock_synced":true},
  {"event_id":"bbbbbbb1-0000-0000-0000-000000000005","device_id":"onhs-main-gate",
   "card_uid":"BADC0DE1","scanned_at":"2026-08-05T07:15:00+08:00","clock_synced":true},
  {"event_id":"bbbbbbb1-0000-0000-0000-000000000006","device_id":"onhs-main-gate",
   "card_uid":"BADC0DE1","scanned_at":"2026-08-05T07:16:00+08:00","clock_synced":true}
]$$::jsonb);

-- ---------------------------------------------------------------------------
-- attendance_day_summary
-- ---------------------------------------------------------------------------

select pta_test.eq(
  (select count(*)::int from pta.attendance_day_summary(
     (select id from pta.schools where school_code = 'ONHS'),
     '2026-08-01', '2026-08-31')),
  3,
  'AT1. The day summary returns one row per day that saw activity, and none for the rest');

-- 07:00 Manila is 23:00Z the day before. A summary that grouped on scanned_at
-- would file this tap under Aug 2 and show the school an empty morning.
select pta_test.eq(
  (select students_present from pta.attendance_day_summary(
     (select id from pta.schools where school_code = 'ONHS'),
     '2026-08-01', '2026-08-31') where local_date = '2026-08-03'),
  2,
  'AT2. A day is the SCHOOL''s day — a 23:00Z tap counts as the next morning');

select pta_test.eq(
  (select scans from pta.attendance_day_summary(
     (select id from pta.schools where school_code = 'ONHS'),
     '2026-08-01', '2026-08-31') where local_date = '2026-08-03'),
  3,
  'AT3. ...and three taps by two children is two present, not three');

-- Asking for the single day must find it too: the scanned_at bounds that let
-- the index prune are padded, so they can never exclude a row local_date keeps.
select pta_test.eq(
  (select students_present from pta.attendance_day_summary(
     (select id from pta.schools where school_code = 'ONHS'),
     '2026-08-03', '2026-08-03')),
  2,
  'AT4. A one-day window still finds a tap whose UTC timestamp is the day before');

select pta_test.eq(
  (select unknown_scans from pta.attendance_day_summary(
     (select id from pta.schools where school_code = 'ONHS'),
     '2026-08-01', '2026-08-31') where local_date = '2026-08-05'),
  2,
  'AT5. Taps by plastic no student holds are counted, and counted separately');

select pta_test.eq(
  (select students_present from pta.attendance_day_summary(
     (select id from pta.schools where school_code = 'ONHS'),
     '2026-08-01', '2026-08-31') where local_date = '2026-08-05'),
  0,
  'AT6. ...and an unknown card is nobody present, not somebody unnamed');

-- ---------------------------------------------------------------------------
-- attendance_student_summary
-- ---------------------------------------------------------------------------

-- Juan, Maria and Ana are enrolled in 2026-2027. Pedro graduated in 08, and
-- School B's Juan is another tenant's problem.
select pta_test.eq(
  (select count(*)::int from pta.attendance_student_summary(
     (select id from pta.schools where school_code = 'ONHS'),
     (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
       where s.school_code = 'ONHS' and sy.name = '2026-2027'),
     '2026-08-01', '2026-08-31')),
  3,
  'AT7. The summary is the whole roll — students with no scan at all are rows, not omissions');

select pta_test.eq(
  (select days_present from pta.attendance_student_summary(
     (select id from pta.schools where school_code = 'ONHS'),
     (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
       where s.school_code = 'ONHS' and sy.name = '2026-2027'),
     '2026-08-01', '2026-08-31') where full_name like 'Cruz,%'),
  2,
  'AT8. days_present counts DAYS — a child who taps in and out was at school once');

select pta_test.eq(
  (select scans from pta.attendance_student_summary(
     (select id from pta.schools where school_code = 'ONHS'),
     (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
       where s.school_code = 'ONHS' and sy.name = '2026-2027'),
     '2026-08-01', '2026-08-31') where full_name like 'Cruz,%'),
  3,
  'AT9. ...while scans still counts every tap');

select pta_test.eq(
  (select days_present from pta.attendance_student_summary(
     (select id from pta.schools where school_code = 'ONHS'),
     (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
       where s.school_code = 'ONHS' and sy.name = '2026-2027'),
     '2026-08-01', '2026-08-31') where full_name like 'Nolasco,%'),
  0,
  'AT10. A student who never tapped comes back with zero, not with nothing');

-- The whole point of the column: Ana's zero is a missing card, and the report
-- must be able to say so instead of reporting her absent for a month.
select pta_test.ok(
  (select not has_card from pta.attendance_student_summary(
     (select id from pta.schools where school_code = 'ONHS'),
     (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
       where s.school_code = 'ONHS' and sy.name = '2026-2027'),
     '2026-08-01', '2026-08-31') where full_name like 'Nolasco,%'),
  'AT11. A cardless student is flagged — her zero is "cannot be seen", not "absent"');

select pta_test.ok(
  (select has_card from pta.attendance_student_summary(
     (select id from pta.schools where school_code = 'ONHS'),
     (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
       where s.school_code = 'ONHS' and sy.name = '2026-2027'),
     '2026-08-01', '2026-08-31') where full_name like 'Cruz,%'),
  'AT12. A student holding a live card is not');

select pta_test.eq(
  (select first_seen::text from pta.attendance_student_summary(
     (select id from pta.schools where school_code = 'ONHS'),
     (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
       where s.school_code = 'ONHS' and sy.name = '2026-2027'),
     '2026-08-01', '2026-08-31') where full_name like 'Bautista,%'),
  '2026-08-03',
  'AT13. first_seen is a school-local calendar date');

-- A window that excludes the scans must zero the counts without dropping the
-- student: "nobody came that week" is an answer, an empty table is not.
select pta_test.eq(
  (select count(*)::int from pta.attendance_student_summary(
     (select id from pta.schools where school_code = 'ONHS'),
     (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
       where s.school_code = 'ONHS' and sy.name = '2026-2027'),
     '2026-07-01', '2026-07-02')
   where days_present = 0),
  3,
  'AT14. A window with no scans in it still returns the roll, all at zero');

-- ---------------------------------------------------------------------------
-- Revocation. has_card is about NOW; the history behind it is untouched (0015).
-- ---------------------------------------------------------------------------

select pta.revoke_student_card(
  (select c.id from pta.student_cards c
   join pta.students st on st.id = c.student_id
   where st.first_name = 'Maria' and c.revoked_at is null));

select pta_test.ok(
  (select not has_card from pta.attendance_student_summary(
     (select id from pta.schools where school_code = 'ONHS'),
     (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
       where s.school_code = 'ONHS' and sy.name = '2026-2027'),
     '2026-08-01', '2026-08-31') where full_name like 'Bautista,%'),
  'AT15. Revoking a card clears has_card');

select pta_test.eq(
  (select days_present from pta.attendance_student_summary(
     (select id from pta.schools where school_code = 'ONHS'),
     (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
       where s.school_code = 'ONHS' and sy.name = '2026-2027'),
     '2026-08-01', '2026-08-31') where full_name like 'Bautista,%'),
  1,
  'AT16. ...and does not erase the day she was actually here');

select pta_test.logout();

-- ---------------------------------------------------------------------------
-- Tenancy and role. Both functions are SECURITY INVOKER, so the answer is
-- whatever RLS would have given the caller reading the rows by hand.
-- ---------------------------------------------------------------------------

select pta_test.login(:B_ADMIN::uuid);

select pta_test.eq(
  (select count(*)::int from pta.attendance_day_summary(
     (select id from pta.schools where school_code = 'ONHS'),
     '2026-08-01', '2026-08-31')),
  0,
  'AT17. Another school''s admin gets no days out of this school''s gate');

select pta_test.eq(
  (select count(*)::int from pta.attendance_student_summary(
     (select id from pta.schools where school_code = 'ONHS'),
     (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
       where s.school_code = 'ONHS' and sy.name = '2026-2027'),
     '2026-08-01', '2026-08-31')),
  0,
  'AT18. ...and no students either');

select pta_test.logout();

-- A cashier reads reports. Nothing here is gated on a role, because nothing
-- here is a write -- the same reasoning as promotion_plan() in 0021.
select pta_test.login(:A_CASHIER::uuid);

select pta_test.eq(
  (select count(*)::int from pta.attendance_day_summary(
     (select id from pta.schools where school_code = 'ONHS'),
     '2026-08-01', '2026-08-31')),
  3,
  'AT19. A cashier at the school can read the summary — it is a read, not a privilege');

select pta_test.logout();
