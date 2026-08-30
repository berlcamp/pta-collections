-- 05_donations.sql — PTA programs, voluntary donations, in-kind giving,
-- pledges, the separate acknowledgement series, and tenant isolation.
--
-- Runs AFTER 04_financial, deliberately: official receipts already exist in
-- School A by this point, so test D3 proves the donation counter is genuinely
-- its own sequence rather than one that merely happens to start at 1.

\set A_ADMIN   '''22222222-2222-2222-2222-222222222222'''
\set A_CASHIER '''33333333-3333-3333-3333-333333333333'''
\set A_TREAS   '''44444444-4444-4444-4444-444444444444'''
\set B_ADMIN   '''55555555-5555-5555-5555-555555555555'''
\set SUPER     '''11111111-1111-1111-1111-111111111111'''

-- ---------------------------------------------------------------------------
-- Setup: School A gets a guardian on file and two programs.
-- ---------------------------------------------------------------------------
select pta_test.login(:A_ADMIN::uuid);

insert into pta.parents_guardians
  (school_id, first_name, last_name, contact_number, created_by)
select id, 'Rosa', 'Dela Cruz', '09171234567', pta.current_profile_id()
from pta.schools where school_code = 'ONHS';

insert into pta.student_guardians (school_id, student_id, guardian_id, relationship, is_primary, created_by)
select s.id, st.id, g.id, 'Mother', true, pta.current_profile_id()
from pta.schools s
join pta.students st on st.school_id = s.id and st.first_name = 'Juan'
join pta.parents_guardians g on g.school_id = s.id and g.first_name = 'Rosa'
where s.school_code = 'ONHS';

insert into pta.donation_programs
  (school_id, school_year_id, name, description, category, target_amount, status, created_by)
select s.id, sy.id, v.name, v.descr, v.cat, v.target, v.status, pta.current_profile_id()
from pta.schools s
join pta.school_years sy on sy.school_id = s.id,
     (values ('Brigada Eskwela 2026', 'School repair week',   'activity', 50000.00, 'open'),
             ('Covered Court Fund',   'Multi-year build',     'project', 200000.00, 'open'),
             ('Recognition Day 2025', 'Last year, wrapped up','activity',  10000.00, 'closed')
     ) as v(name, descr, cat, target, status)
where s.school_code = 'ONHS';

select pta_test.eq((select count(*) from pta.donation_programs)::int, 3,
  'D1. An admin can create donation programs');
select pta_test.logout();

-- A cashier must not be able to invent a program — that is configuration.
select pta_test.login(:A_CASHIER::uuid);
select pta_test.throws($$
  insert into pta.donation_programs (school_id, school_year_id, name, created_by)
  select s.id, sy.id, 'Cashier''s Own Fund', pta.current_profile_id()
  from pta.schools s join pta.school_years sy on sy.school_id = s.id
  where s.school_code = 'ONHS'
$$, 'D2. A cashier cannot create a donation program');
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- Cash donations and the separate acknowledgement series
-- ---------------------------------------------------------------------------
select pta_test.login(:A_CASHIER::uuid);

create temp view _a_school as
  select id from pta.schools where school_code = 'ONHS';
create temp view _a_year as
  select sy.id from pta.school_years sy
  join pta.schools s on s.id = sy.school_id where s.school_code = 'ONHS';
create temp view _brigada as
  select p.id from pta.donation_programs p
  join pta.schools s on s.id = p.school_id
  where s.school_code = 'ONHS' and p.name = 'Brigada Eskwela 2026';

-- A parent already on file donates. The donor row is created from the guardian.
create temp table _d1 as
select * from pta.record_donation(
  (select id from _a_school),
  (select id from _a_year),
  (select id from _brigada),
  'cash', 1500.00, 'cash', null,
  null,
  jsonb_build_object(
    'display_name', 'Rosa Dela Cruz',
    'donor_type', 'guardian',
    'guardian_id', (select g.id from pta.parents_guardians g
                    join pta.schools s on s.id = g.school_id
                    where s.school_code = 'ONHS' and g.first_name = 'Rosa')));

select pta_test.eq(
  (select acknowledgement_number from _d1),
  (select receipt_prefix from pta.schools where school_code = 'ONHS') || '-2026-D-000001',
  'D3. The first acknowledgement is -D-000001 even though ORs already exist');

select pta_test.ok(
  not exists (select 1 from pta.payments
              where receipt_number = (select acknowledgement_number from _d1)),
  'D4. A donation acknowledgement number is not an official receipt number');

select pta_test.eq(
  (select d.amount from pta.donations d where d.id = (select donation_id from _d1)),
  1500.00::numeric,
  'D5. The cash donation is recorded at its full amount');

select pta_test.ok(
  (select dn.guardian_id is not null from pta.donors dn
   where dn.id = (select d.donor_id from pta.donations d
                  where d.id = (select donation_id from _d1))),
  'D6. A donating parent is linked back to their guardian record');

-- The same parent gives again: one donor row, not two.
create temp table _d2 as
select * from pta.record_donation(
  (select id from _a_school), (select id from _a_year), (select id from _brigada),
  'cash', 500.00, 'gcash', null,
  null,
  jsonb_build_object(
    'display_name', 'Rosa Dela Cruz', 'donor_type', 'guardian',
    'guardian_id', (select g.id from pta.parents_guardians g
                    join pta.schools s on s.id = g.school_id
                    where s.school_code = 'ONHS' and g.first_name = 'Rosa')),
  false, null, 'GC-889112');

select pta_test.eq((select count(*) from pta.donors)::int, 1,
  'D7. A repeat donor reuses their existing donor row');

select pta_test.eq(
  (select acknowledgement_number from _d2),
  (select receipt_prefix from pta.schools where school_code = 'ONHS') || '-2026-D-000002',
  'D8. The acknowledgement series increments');

-- An outside donor with no student in the school at all.
create temp table _d3 as
select * from pta.record_donation(
  (select id from _a_school), (select id from _a_year), (select id from _brigada),
  'cash', 5000.00, 'bank_transfer', null,
  null,
  jsonb_build_object('display_name', 'Ozamiz Hardware Supply',
                     'donor_type', 'business',
                     'contact_number', '09998887777'));

select pta_test.ok(
  exists (select 1 from pta.donors
          where display_name = 'Ozamiz Hardware Supply'
            and donor_type = 'business'
            and guardian_id is null and student_id is null),
  'D9. A business with no student in the school can donate');

-- Anonymous.
create temp table _d4 as
select * from pta.record_donation(
  (select id from _a_school), (select id from _a_year), (select id from _brigada),
  'cash', 200.00, 'cash', null,
  null, null, true);

select pta_test.ok(
  (select d.donor_id is null and d.is_anonymous
   from pta.donations d where d.id = (select donation_id from _d4)),
  'D10. An anonymous donation carries no donor at all');

select pta_test.eq((select count(*) from pta.donors)::int, 2,
  'D11. An anonymous donation creates no donor row');

select pta_test.logout();

-- ---------------------------------------------------------------------------
-- Shape rules: cash needs a method, in-kind needs a description
-- ---------------------------------------------------------------------------
select pta_test.login(:A_CASHIER::uuid);

select pta_test.throws($$
  select pta.record_donation(
    (select id from _a_school), (select id from _a_year), (select id from _brigada),
    'cash', 100.00, null, null, null, null, true)
$$, 'D12. A cash donation without a payment method is rejected');

select pta_test.throws($$
  select pta.record_donation(
    (select id from _a_school), (select id from _a_year), (select id from _brigada),
    'in_kind', 100.00, null, null, null, null, true)
$$, 'D13. An in-kind donation without a description is rejected');

select pta_test.throws($$
  select pta.record_donation(
    (select id from _a_school), (select id from _a_year), (select id from _brigada),
    'cash', 0.00, 'cash', null, null, null, true)
$$, 'D14. A zero-peso donation is rejected');

select pta_test.throws($$
  select pta.record_donation(
    (select id from _a_school), (select id from _a_year), (select id from _brigada),
    'cash', 100.00, 'cash', null, null, null, false)
$$, 'D15. A non-anonymous donation with no donor is rejected');

-- In-kind: 20 sacks of cement valued at 5,000.
create temp table _d5 as
select * from pta.record_donation(
  (select id from _a_school), (select id from _a_year), (select id from _brigada),
  'in_kind', 5000.00, null, '20 sacks of cement',
  null,
  jsonb_build_object('display_name', 'Ozamiz Hardware Supply', 'donor_type', 'business'));

select pta_test.ok(
  (select d.payment_method is null and d.item_description = '20 sacks of cement'
   from pta.donations d where d.id = (select donation_id from _d5)),
  'D16. An in-kind donation carries a description and no payment method');

select pta_test.logout();

-- ---------------------------------------------------------------------------
-- In-kind must never contaminate a cash total
-- ---------------------------------------------------------------------------
select pta_test.login(:A_TREAS::uuid);

-- Cash so far: 1500 + 500 + 5000 + 200 = 7200. In-kind: 5000.
select pta_test.eq(
  (select cash_received from pta.v_donation_program_totals
   where program_id = (select id from _brigada)), 7200.00::numeric,
  'D17. Program cash received excludes the in-kind donation');

select pta_test.eq(
  (select in_kind_value from pta.v_donation_program_totals
   where program_id = (select id from _brigada)), 5000.00::numeric,
  'D18. In-kind value is reported in its own column');

select pta_test.eq(
  (select total_received from pta.v_donation_program_totals
   where program_id = (select id from _brigada)), 12200.00::numeric,
  'D19. Total received is cash plus in-kind');

select pta_test.eq(
  (select coalesce(sum(cash_total), 0) from pta.v_daily_donations
   where school_id = (select id from _a_school)), 7200.00::numeric,
  'D20. The daily donation sheet counts cash only');

-- 12200 / 50000 = 24.4%
select pta_test.eq(
  (select progress_pct from pta.v_donation_program_totals
   where program_id = (select id from _brigada)), 24.4::numeric,
  'D21. Progress against the target is computed from total received');

-- A program nobody has given to yet must still appear, at zero — a LEFT JOIN
-- that dropped it would hide the fundraiser that most needs attention.
select pta_test.eq(
  (select total_received from pta.v_donation_program_totals
   where name = 'Covered Court Fund'
     and school_id = (select id from _a_school)), 0::numeric,
  'D22. A program with no donations yet still reports, at zero');

select pta_test.eq(
  (select donation_count from pta.v_donation_program_totals
   where name = 'Covered Court Fund'
     and school_id = (select id from _a_school)), 0::bigint,
  'D22b. Its donation count is zero rather than null');

select pta_test.logout();

-- ---------------------------------------------------------------------------
-- A closed program takes nothing further
-- ---------------------------------------------------------------------------
select pta_test.login(:A_CASHIER::uuid);
select pta_test.throws($$
  select pta.record_donation(
    (select id from _a_school), (select id from _a_year),
    (select p.id from pta.donation_programs p
     where p.name = 'Recognition Day 2025'
       and p.school_id = (select id from _a_school)),
    'cash', 100.00, 'cash', null, null, null, true)
$$, 'D23. A closed program does not accept new donations');
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- Pledges
-- ---------------------------------------------------------------------------
select pta_test.login(:A_TREAS::uuid);

create temp table _pledge as
select pta.create_pledge(
  (select id from _a_school), (select id from _a_year), (select id from _brigada),
  3000.00,
  (select id from pta.donors where display_name = 'Rosa Dela Cruz'),
  null, '2026-08-31'::date, 'Promised at the general assembly') as id;

select pta_test.eq(
  (select fulfilment_status from pta.v_donation_pledge_status
   where id = (select id from _pledge)), 'open',
  'D24. A new pledge is open and unfulfilled');

select pta_test.eq(
  (select remaining_amount from pta.v_donation_pledge_status
   where id = (select id from _pledge)), 3000.00::numeric,
  'D25. The full pledged amount is outstanding');

select pta_test.eq(
  (select pledge_outstanding from pta.v_donation_program_totals
   where program_id = (select id from _brigada)), 3000.00::numeric,
  'D26. The program reports what is still promised but not received');

select pta_test.logout();

select pta_test.login(:A_CASHIER::uuid);

-- Part-payment of the pledge.
select pta.record_donation(
  (select id from _a_school), (select id from _a_year), (select id from _brigada),
  'cash', 1000.00, 'cash', null,
  (select id from pta.donors where display_name = 'Rosa Dela Cruz'),
  null, false, (select id from _pledge));

select pta_test.eq(
  (select fulfilment_status from pta.v_donation_pledge_status
   where id = (select id from _pledge)), 'partially_fulfilled',
  'D27. A part-payment moves the pledge to partially fulfilled');

select pta_test.eq(
  (select remaining_amount from pta.v_donation_pledge_status
   where id = (select id from _pledge)), 2000.00::numeric,
  'D28. The pledge remainder is derived, not stored');

-- A pledge can be honoured in kind.
select pta.record_donation(
  (select id from _a_school), (select id from _a_year), (select id from _brigada),
  'in_kind', 2500.00, null, 'Plywood and paint',
  (select id from pta.donors where display_name = 'Rosa Dela Cruz'),
  null, false, (select id from _pledge));

select pta_test.eq(
  (select fulfilment_status from pta.v_donation_pledge_status
   where id = (select id from _pledge)), 'fulfilled',
  'D29. Goods delivered against a pledge fulfil it');

select pta_test.eq(
  (select remaining_amount from pta.v_donation_pledge_status
   where id = (select id from _pledge)), 0.00::numeric,
  'D30. Over-delivering clamps the remainder at zero rather than going negative');

-- Someone else cannot pay off your pledge — the pledge names its donor.
select pta_test.throws($$
  select pta.record_donation(
    (select id from _a_school), (select id from _a_year), (select id from _brigada),
    'cash', 500.00, 'cash', null,
    (select id from pta.donors where display_name = 'Ozamiz Hardware Supply'),
    null, false, (select id from _pledge))
$$, 'D31. A pledge can only be redeemed by the donor who made it');

select pta_test.throws($$
  select pta.record_donation(
    (select id from _a_school), (select id from _a_year), (select id from _brigada),
    'cash', 500.00, 'cash', null, null, null, true, (select id from _pledge))
$$, 'D32. An anonymous donation cannot redeem a named pledge');

select pta_test.logout();

-- Cancelling a pledge is a treasurer/admin act and needs a reason.
select pta_test.login(:A_CASHIER::uuid);
select pta_test.throws($$
  select pta.cancel_pledge((select id from _pledge), 'changed my mind')
$$, 'D33. A cashier cannot cancel a pledge');
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- Voids
-- ---------------------------------------------------------------------------
select pta_test.login(:A_CASHIER::uuid);
select pta_test.throws($$
  select pta.void_donation((select donation_id from _d4), 'wrong amount')
$$, 'D34. A cashier cannot void a donation');
select pta_test.logout();

select pta_test.login(:A_TREAS::uuid);

select pta_test.throws($$
  select pta.void_donation((select donation_id from _d4), '   ')
$$, 'D35. Voiding a donation without a reason is rejected');

select pta.void_donation((select donation_id from _d4), 'Duplicate entry at the gate');

select pta_test.eq(
  (select cash_received from pta.v_donation_program_totals
   where program_id = (select id from _brigada)), 8000.00::numeric,
  'D36. A voided donation leaves the program total (7200 - 200 + 1000 pledge payment)');

select pta_test.throws($$
  select pta.void_donation((select donation_id from _d4), 'again')
$$, 'D37. A void is not repeatable');

select pta_test.ok(
  (select void_reason is not null and voided_by is not null and voided_at is not null
   from pta.donations where id = (select donation_id from _d4)),
  'D38. A voided donation records who, when and why');

select pta_test.logout();

-- ---------------------------------------------------------------------------
-- Idempotency — a double-tapped Save must not raise two acknowledgements
-- ---------------------------------------------------------------------------
select pta_test.login(:A_CASHIER::uuid);

create temp table _idem1 as
select * from pta.record_donation(
  (select id from _a_school), (select id from _a_year), (select id from _brigada),
  'cash', 750.00, 'cash', null, null,
  jsonb_build_object('display_name', 'Ozamiz Hardware Supply'),
  false, null, null, null, 'donate-key-abc');

create temp table _idem2 as
select * from pta.record_donation(
  (select id from _a_school), (select id from _a_year), (select id from _brigada),
  'cash', 750.00, 'cash', null, null,
  jsonb_build_object('display_name', 'Ozamiz Hardware Supply'),
  false, null, null, null, 'donate-key-abc');

select pta_test.eq((select donation_id from _idem1), (select donation_id from _idem2),
  'D39. Replaying the same idempotency key returns the first donation');
select pta_test.eq(
  (select count(*)::int from pta.donations where idempotency_key = 'donate-key-abc'), 1,
  'D40. Only one donation row exists for a replayed key');

select pta_test.logout();

-- ---------------------------------------------------------------------------
-- Tenant isolation
-- ---------------------------------------------------------------------------
select pta_test.login(:B_ADMIN::uuid);

select pta_test.eq((select count(*)::int from pta.donations), 0,
  'D41. School B sees none of School A''s donations');
select pta_test.eq((select count(*)::int from pta.donors), 0,
  'D42. School B sees none of School A''s donors');
select pta_test.eq((select count(*)::int from pta.donation_programs), 0,
  'D43. School B sees none of School A''s programs');
select pta_test.eq((select count(*)::int from pta.v_donation_program_totals), 0,
  'D44. The program totals view is tenant-scoped');
select pta_test.eq((select count(*)::int from pta.v_donor_totals), 0,
  'D45. The donor totals view is tenant-scoped');

select pta_test.throws($$
  select pta.record_donation(
    (select id from pta.schools where school_code = 'TNHS'),
    (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
      where s.school_code = 'TNHS'),
    (select p.id from pta.donation_programs p
      join pta.schools s on s.id = p.school_id
      where s.school_code = 'ONHS' and p.name = 'Brigada Eskwela 2026'),
    'cash', 100.00, 'cash', null, null, null, true)
$$, 'D46. School B cannot donate into School A''s program');

select pta_test.throws($$
  select pta.void_donation(
    (select id from pta.donations limit 1), 'not mine')
$$, 'D47. School B cannot void a donation it cannot even see');

select pta_test.logout();

-- ---------------------------------------------------------------------------
-- Donations never touch the fee-collection path
-- ---------------------------------------------------------------------------
select pta_test.login(:A_TREAS::uuid);

select pta_test.eq(
  (select count(*)::int from pta.student_charges
   where description ilike '%donat%' or description ilike '%brigada%'), 0,
  'D48. Recording donations created no student charges');

select pta_test.ok(
  not exists (
    select 1 from pta.payment_items pi
    join pta.student_charges c on c.id = pi.student_charge_id
    where c.fee_type_id in (
      select ft.id from pta.fee_types ft where ft.name ilike '%donat%')),
  'D49. No donation leaked into the official-receipt payment path');

select pta_test.ok(
  exists (select 1 from pta.audit_logs where action = 'DONATION_RECORDED'),
  'D50. Donations are audited');
select pta_test.ok(
  exists (select 1 from pta.audit_logs where action = 'DONATION_VOIDED'),
  'D51. Donation voids are audited');
select pta_test.ok(
  exists (select 1 from pta.audit_logs where action = 'PLEDGE_CREATED'),
  'D52. Pledges are audited');

select pta_test.logout();

-- ---------------------------------------------------------------------------
-- A super admin acting inside a school is stamped, as on the payment path
-- ---------------------------------------------------------------------------
select pta_test.login(:SUPER::uuid);

create temp table _dsuper as
select * from pta.record_donation(
  (select id from _a_school), (select id from _a_year), (select id from _brigada),
  'cash', 100.00, 'cash', null, null, null, true);

select pta_test.ok(
  (select acting_as_super_admin from pta.donations
   where id = (select donation_id from _dsuper)),
  'D53. A super admin donation is stamped acting_as_super_admin');

select pta_test.logout();

-- ---------------------------------------------------------------------------
-- anon gets nothing
-- ---------------------------------------------------------------------------
select pta_test.ok(
  not has_table_privilege('anon', 'pta.donations', 'select'),
  'D54. anon cannot read donations');
select pta_test.ok(
  not has_table_privilege('anon', 'pta.donors', 'select'),
  'D55. anon cannot read the donor directory');
select pta_test.ok(
  not has_function_privilege('anon',
    'pta.record_donation(uuid, uuid, uuid, text, numeric, text, text, uuid, jsonb, boolean, uuid, text, text, text)',
    'execute'),
  'D56. anon cannot record a donation');
