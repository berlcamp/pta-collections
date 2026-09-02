-- 08_promotion.sql — rolling the roll forward into the next school year:
-- grade progression, the exit cohort, idempotency, tenancy, and the promise
-- that none of it touches money.

\set A_ADMIN   '''22222222-2222-2222-2222-222222222222'''
\set A_CASHIER '''33333333-3333-3333-3333-333333333333'''
\set B_ADMIN   '''55555555-5555-5555-5555-555555555555'''

-- ---------------------------------------------------------------------------
-- Setup. School A's three students are all in Grade 7, which would make the
-- exit grade and the promoting grade the same thing and hide every bug worth
-- catching. Move Pedro to the top of the ladder so the two are distinct.
-- ---------------------------------------------------------------------------
select pta_test.login(:A_ADMIN::uuid);

update pta.student_enrollments
   set grade_level = 'Grade 10'
 where student_id = (
         select st.id from pta.students st
         join pta.schools s on s.id = st.school_id
         where s.school_code = 'ONHS' and st.first_name = 'Pedro')
   and school_year_id = (
         select sy.id from pta.school_years sy
         join pta.schools s on s.id = sy.school_id
         where s.school_code = 'ONHS' and sy.name = '2026-2027');

insert into pta.school_years (school_id, name, start_date, end_date, is_active, created_by)
select id, '2027-2028', '2027-06-01', '2028-03-31', false, pta.current_profile_id()
from pta.schools where school_code = 'ONHS';

-- The money as it stands before any of this, to compare against afterwards.
create temp table _money_before as
select
  (select count(*) from pta.student_charges)                          as charges,
  (select count(*) from pta.payments)                                 as payments,
  (select coalesce(sum(balance), 0) from pta.v_student_charge_balances
    where status = 'active')                                          as balance;

-- ---------------------------------------------------------------------------
-- The exit grade and the plan
-- ---------------------------------------------------------------------------

select pta_test.eq(
  pta.default_exit_grade(
    (select id from pta.schools where school_code = 'ONHS'),
    (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
      where s.school_code = 'ONHS' and sy.name = '2026-2027')),
  'Grade 10',
  'PR1. The exit grade defaults to the highest grade actually enrolled, not to Grade 12');

create temp table _plan as
select * from pta.promotion_plan(
  (select id from pta.schools where school_code = 'ONHS'),
  (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
    where s.school_code = 'ONHS' and sy.name = '2026-2027'),
  (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
    where s.school_code = 'ONHS' and sy.name = '2027-2028'));

select pta_test.eq((select count(*)::int from _plan), 2,
  'PR2. The plan has one row per grade in the source year');

select pta_test.eq((select to_grade from _plan where from_grade = 'Grade 7'), 'Grade 8',
  'PR3. Grade 7 promotes one step up sort_order, to Grade 8');

select pta_test.eq((select to_grade from _plan where from_grade = 'Grade 10'), null::text,
  'PR4. The exit grade maps to no grade at all — it graduates');

select pta_test.eq((select eligible from _plan where from_grade = 'Grade 7'), 2,
  'PR5. Two students are eligible in Grade 7');

select pta_test.eq((select to_promote from _plan where from_grade = 'Grade 10'), 0,
  'PR6. The graduating grade promotes nobody');

-- The one student with dues outstanding on the closing year is Pedro, who is
-- also the one about to graduate — which is exactly the case the count exists
-- to surface, since graduating him moves his debt behind the "include
-- inactive" toggle on /charges/outstanding.
select pta_test.ok((select with_balance from _plan where from_grade = 'Grade 10') > 0,
  'PR7. The plan counts who still owes on the year being closed');

-- ---------------------------------------------------------------------------
-- The commit
-- ---------------------------------------------------------------------------

create temp table _run1 as
select * from pta.promote_students(
  (select id from pta.schools where school_code = 'ONHS'),
  (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
    where s.school_code = 'ONHS' and sy.name = '2026-2027'),
  (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
    where s.school_code = 'ONHS' and sy.name = '2027-2028'));

select pta_test.eq((select promoted_count from _run1), 2,
  'PR8. Two students were promoted');
select pta_test.eq((select graduated_count from _run1), 1,
  'PR9. One student graduated');
select pta_test.eq((select skipped_count from _run1), 0,
  'PR10. Nothing was skipped on a first run');

select pta_test.eq(
  (select count(*)::int from pta.student_enrollments e
   join pta.school_years sy on sy.id = e.school_year_id
   where sy.name = '2027-2028' and e.grade_level = 'Grade 8'),
  2,
  'PR11. Both promoted students landed in Grade 8 of the new year');

select pta_test.eq(
  (select count(*)::int from pta.student_enrollments e
   join pta.school_years sy on sy.id = e.school_year_id
   where sy.name = '2027-2028' and e.section_id is not null),
  0,
  'PR12. Promotion carries no section — sections belong to one year');

select pta_test.eq(
  (select e.student_number from pta.student_enrollments e
   join pta.school_years sy on sy.id = e.school_year_id
   join pta.students st on st.id = e.student_id
   where sy.name = '2027-2028' and st.first_name = 'Juan'),
  (select e.student_number from pta.student_enrollments e
   join pta.school_years sy on sy.id = e.school_year_id
   join pta.students st on st.id = e.student_id
   where sy.name = '2026-2027' and st.first_name = 'Juan'),
  'PR13. The student number carries forward');

select pta_test.eq(
  (select st.status from pta.students st
   join pta.schools s on s.id = st.school_id
   where s.school_code = 'ONHS' and st.first_name = 'Pedro'),
  'graduated',
  'PR14. The exit cohort is marked graduated');

select pta_test.eq(
  (select e.status from pta.student_enrollments e
   join pta.students st on st.id = e.student_id
   join pta.school_years sy on sy.id = e.school_year_id
   join pta.schools s on s.id = st.school_id
   where s.school_code = 'ONHS' and st.first_name = 'Pedro' and sy.name = '2026-2027'),
  'graduated',
  'PR15. The enrollment that ended in graduation says so');

select pta_test.eq(
  (select count(*)::int from pta.student_enrollments e
   join pta.students st on st.id = e.student_id
   join pta.school_years sy on sy.id = e.school_year_id
   where sy.name = '2027-2028' and st.first_name = 'Pedro'),
  0,
  'PR16. A graduate gets no enrollment in the new year');

-- ---------------------------------------------------------------------------
-- Money is untouched (D25: a graduate KEEPS their dues)
-- ---------------------------------------------------------------------------

select pta_test.eq(
  (select count(*) from pta.student_charges), (select charges from _money_before),
  'PR17. Promotion created and destroyed no charge');
select pta_test.eq(
  (select count(*) from pta.payments), (select payments from _money_before),
  'PR18. Promotion created and destroyed no payment');
select pta_test.eq(
  (select coalesce(sum(balance), 0) from pta.v_student_charge_balances where status = 'active'),
  (select balance from _money_before),
  'PR19. Not one peso of outstanding balance moved');

select pta_test.ok(
  exists (select 1 from pta.v_outstanding_dues d
          join pta.students st on st.id = d.student_id
          where st.first_name = 'Pedro' and d.student_status = 'graduated'),
  'PR20. A graduate still appears in outstanding dues, flagged inactive');

-- ---------------------------------------------------------------------------
-- Idempotency
-- ---------------------------------------------------------------------------

create temp table _run2 as
select * from pta.promote_students(
  (select id from pta.schools where school_code = 'ONHS'),
  (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
    where s.school_code = 'ONHS' and sy.name = '2026-2027'),
  (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
    where s.school_code = 'ONHS' and sy.name = '2027-2028'));

select pta_test.eq((select promoted_count from _run2), 0,
  'PR21. Re-running promotes nobody a second time');
select pta_test.eq((select skipped_count from _run2), 2,
  'PR22. Re-running reports the two already carried forward');
select pta_test.eq(
  (select count(*)::int from pta.student_enrollments e
   join pta.school_years sy on sy.id = e.school_year_id
   where sy.name = '2027-2028'),
  2,
  'PR23. Re-running did not double-enroll anyone');

select pta_test.eq((select graduated_count from _run2), 0,
  'PR23a. Re-running graduates nobody — the exit grade does not walk down the ladder');

select pta_test.eq(
  (select count(*)::int from pta.students st
   join pta.schools s on s.id = st.school_id
   where s.school_code = 'ONHS' and st.status = 'active'),
  2,
  'PR23b. ...and the two promoted students are still active after a second run');

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

select pta_test.throws($$
  select pta.promote_students(
    (select id from pta.schools where school_code = 'ONHS'),
    (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
      where s.school_code = 'ONHS' and sy.name = '2026-2027'),
    (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
      where s.school_code = 'ONHS' and sy.name = '2026-2027'))$$,
  'PR24. Promoting a year into itself is refused');

select pta_test.throws($$
  select pta.promote_students(
    (select id from pta.schools where school_code = 'ONHS'),
    (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
      where s.school_code = 'ONHS' and sy.name = '2027-2028'),
    (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
      where s.school_code = 'ONHS' and sy.name = '2026-2027'))$$,
  'PR25. Promoting backwards into a closed year is refused');

select pta_test.throws($$
  select pta.promote_students(
    (select id from pta.schools where school_code = 'ONHS'),
    (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
      where s.school_code = 'ONHS' and sy.name = '2026-2027'),
    (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
      where s.school_code = 'ONHS' and sy.name = '2027-2028'),
    'Grade Fourteen')$$,
  'PR26. An unknown exit grade is refused');

-- A school year belonging to the OTHER school is not a target.
select pta_test.throws($$
  select pta.promote_students(
    (select id from pta.schools where school_code = 'ONHS'),
    (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
      where s.school_code = 'ONHS' and sy.name = '2026-2027'),
    (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
      where s.school_code = 'TNHS'))$$,
  'PR27. A school year from another school is refused as the target');

select pta_test.logout();

-- ---------------------------------------------------------------------------
-- Who may run it
-- ---------------------------------------------------------------------------

select pta_test.login(:A_CASHIER::uuid);
select pta_test.throws($$
  select pta.promote_students(
    (select id from pta.schools where school_code = 'ONHS'),
    (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
      where s.school_code = 'ONHS' and sy.name = '2026-2027'),
    (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
      where s.school_code = 'ONHS' and sy.name = '2027-2028'))$$,
  'PR28. A cashier cannot promote a school');
select pta_test.logout();

select pta_test.login(:B_ADMIN::uuid);
select pta_test.throws($$
  select pta.promote_students(
    (select id from pta.schools where school_code = 'ONHS'),
    (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
      where s.school_code = 'ONHS' and sy.name = '2026-2027'),
    (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
      where s.school_code = 'ONHS' and sy.name = '2027-2028'))$$,
  'PR29. Another school''s admin cannot promote this school');

-- promotion_plan is SECURITY INVOKER, so RLS answers for it: School B's admin
-- reads School A's roll as empty rather than being refused.
select pta_test.eq(
  (select count(*)::int from pta.promotion_plan(
    (select id from pta.schools where school_code = 'ONHS'),
    (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
      where s.school_code = 'ONHS' and sy.name = '2026-2027'),
    (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
      where s.school_code = 'ONHS' and sy.name = '2027-2028'))),
  0,
  'PR30. The plan is RLS-scoped — another school sees no rows in it');
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- The audit trail
-- ---------------------------------------------------------------------------

select pta_test.eq(
  (select count(*)::int from pta.audit_logs
    where action = 'STUDENTS_PROMOTED'
      and school_id = (select id from pta.schools where school_code = 'ONHS')),
  2,
  'PR31. Both promotion runs are on the audit log');

select pta_test.eq(
  (select new_values ->> 'exit_grade' from pta.audit_logs
    where action = 'STUDENTS_PROMOTED' order by created_at limit 1),
  'Grade 10',
  'PR32. The audit row records which grade was graduated');
