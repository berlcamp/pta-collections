-- 03_isolation.sql — cross-tenant isolation (§7.3). The tests that matter most.
-- Nothing here goes through the UI; every assertion hits the database directly.

\set A_ADMIN   '''22222222-2222-2222-2222-222222222222'''
\set A_CASHIER '''33333333-3333-3333-3333-333333333333'''
\set A_TREAS   '''44444444-4444-4444-4444-444444444444'''
\set B_ADMIN   '''55555555-5555-5555-5555-555555555555'''
\set SUPER     '''11111111-1111-1111-1111-111111111111'''
\set NOBODY    '''77777777-7777-7777-7777-777777777777'''

-- Give School A a charge and a payment to look at, as School A's cashier.
select pta_test.login(:A_ADMIN::uuid);
select pta.assess_annual_fees(
  (select id from pta.schools where school_code = 'ONHS'),
  (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
    where s.school_code = 'ONHS'),
  array(select ft.id from pta.fee_types ft join pta.schools s on s.id = ft.school_id
        where s.school_code = 'ONHS' and ft.category = 'annual')
);
select pta_test.logout();

select pta_test.login(:B_ADMIN::uuid);
select pta.assess_annual_fees(
  (select id from pta.schools where school_code = 'TNHS'),
  (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
    where s.school_code = 'TNHS'),
  array(select ft.id from pta.fee_types ft join pta.schools s on s.id = ft.school_id
        where s.school_code = 'TNHS')
);
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- 0. Uninvited user (D4)
-- ---------------------------------------------------------------------------
select pta_test.ok(
  not exists (select 1 from pta.profiles where email = 'nobody@example.com'),
  '0a. An uninvited Google account leaves no profile behind');

select pta_test.login(:NOBODY::uuid);
select pta_test.eq((select count(*) from pta.students)::int, 0,
  '0b. An uninvited user reads 0 students');
select pta_test.eq((select count(*) from pta.schools)::int, 0,
  '0c. An uninvited user reads 0 schools');
select pta_test.eq(array_length(pta.current_school_ids(), 1), null,
  '0d. An uninvited user has no school context');
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- 1-3. School A staff cannot read School B data
-- ---------------------------------------------------------------------------
select pta_test.login(:A_ADMIN::uuid);
select pta_test.eq(
  (select count(*) from pta.students st join pta.schools s on s.id = st.school_id
    where s.school_code = 'TNHS')::int, 0,
  '1. School A admin reads 0 School B students');
select pta_test.eq((select count(*) from pta.students)::int, 3,
  '1b. School A admin reads exactly their own 3 students');
select pta_test.logout();

select pta_test.login(:A_CASHIER::uuid);
select pta_test.eq(
  (select count(*) from pta.payments p join pta.schools s on s.id = p.school_id
    where s.school_code = 'TNHS')::int, 0,
  '2. School A cashier reads 0 School B payments');
select pta_test.logout();

select pta_test.login(:A_TREAS::uuid);
select pta_test.eq(
  (select count(*) from pta.student_charges c join pta.schools s on s.id = c.school_id
    where s.school_code = 'TNHS')::int, 0,
  '3. School A treasurer reads 0 School B charges');
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- 4. School A admin cannot create a payment for a School B student
-- ---------------------------------------------------------------------------
select pta_test.login(:A_ADMIN::uuid);
select pta_test.throws(
  format($f$select pta.create_payment(
      %L::uuid, %L::uuid, %L::uuid, 'cash',
      '[{"charge_id":"%s","amount":10}]'::jsonb)$f$,
    (select id from pta.schools where school_code = 'TNHS'),
    (select st.id from pta.students st join pta.schools s on s.id = st.school_id
      where s.school_code = 'TNHS' limit 1),
    (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
      where s.school_code = 'TNHS'),
    (select c.id from pta.student_charges c join pta.schools s on s.id = c.school_id
      where s.school_code = 'TNHS' limit 1)),
  '4. School A admin cannot create a payment in School B');
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- 5. School A admin cannot modify School B fee types
-- ---------------------------------------------------------------------------
select pta_test.login(:A_ADMIN::uuid);
with attempted as (
  update pta.fee_types ft set default_amount = 999
  from pta.schools s
  where s.id = ft.school_id and s.school_code = 'TNHS'
  returning 1
)
select pta_test.eq((select count(*) from attempted)::int, 0,
  '5. School A admin modifies 0 School B fee types');
select pta_test.logout();

select pta_test.login(:B_ADMIN::uuid);
select pta_test.eq(
  (select default_amount from pta.fee_types ft join pta.schools s on s.id = ft.school_id
    where s.school_code = 'TNHS'), 150.00::numeric,
  '5b. School B fee amount is untouched');
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- 6. Audit logs are tenant-scoped
-- ---------------------------------------------------------------------------
select pta_test.login(:A_ADMIN::uuid);
select pta_test.eq(
  (select count(*) from pta.audit_logs a join pta.schools s on s.id = a.school_id
    where s.school_code = 'TNHS')::int, 0,
  '6. School A user reads 0 School B audit logs');
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- 7-8. Super Admin reaches both schools, and is stamped when acting
-- ---------------------------------------------------------------------------
select pta_test.login(:SUPER::uuid);
select pta_test.eq((select count(distinct school_id) from pta.students)::int, 2,
  '7. Super Admin reads students from both schools');
select pta_test.eq(array_length(pta.current_school_ids(), 1), 2,
  '8. Super Admin has both schools in context');
select pta_test.ok(
  pta.acting_as_super_admin((select id from pta.schools where school_code = 'TNHS')),
  '8b. Super Admin without a membership is flagged as acting');
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- 10. Deactivation takes effect immediately (D12 — no stale JWT claims)
-- ---------------------------------------------------------------------------
select pta_test.login(:A_ADMIN::uuid);
update pta.school_users set status = 'inactive'
where profile_id = (select id from pta.profiles where email = 'cashier.a@example.com');
select pta_test.logout();

select pta_test.login(:A_CASHIER::uuid);
select pta_test.eq((select count(*) from pta.students)::int, 0,
  '10a. A deactivated membership yields 0 rows on the very next query');
select pta_test.logout();

select pta_test.login(:A_ADMIN::uuid);
update pta.school_users set status = 'active'
where profile_id = (select id from pta.profiles where email = 'cashier.a@example.com');
select pta_test.logout();

select pta_test.login(:A_CASHIER::uuid);
select pta_test.eq((select count(*) from pta.students)::int, 3,
  '10b. Reactivating restores access immediately');
select pta_test.logout();

-- Deactivating the SCHOOL locks everyone out, including its admin.
select pta_test.login(:SUPER::uuid);
update pta.schools set active = false where school_code = 'ONHS';
select pta_test.logout();

select pta_test.login(:A_ADMIN::uuid);
select pta_test.eq((select count(*) from pta.students)::int, 0,
  '10c. Deactivating a school locks out its own admin');
select pta_test.logout();

select pta_test.login(:SUPER::uuid);
update pta.schools set active = true where school_code = 'ONHS';
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- 11. audit_logs is append-only, even for admins (D23)
-- ---------------------------------------------------------------------------
select pta_test.login(:A_ADMIN::uuid);
with attempted as (
  update pta.audit_logs set action = 'TAMPERED'
  where school_id = any (pta.current_school_ids()) returning 1
)
select pta_test.eq((select count(*) from attempted)::int, 0,
  '11a. An admin cannot UPDATE an audit log row');
with attempted as (
  delete from pta.audit_logs where school_id = any (pta.current_school_ids()) returning 1
)
select pta_test.eq((select count(*) from attempted)::int, 0,
  '11b. An admin cannot DELETE an audit log row');
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- 12. A user cannot promote themselves to super admin
-- ---------------------------------------------------------------------------
select pta_test.login(:A_ADMIN::uuid);
select pta_test.throws(
  $$update pta.profiles set global_role = 'super_admin' where auth_user_id = auth.uid()$$,
  '12. A school admin cannot promote themselves to Super Admin');
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- 13. D8 — the same LRN legitimately exists in two schools
-- ---------------------------------------------------------------------------
select pta_test.login(:SUPER::uuid);
select pta_test.eq((select count(*) from pta.students where lrn = '123456789012')::int, 2,
  '13. The same LRN exists in two schools (a transfer), as D8 requires');
select pta_test.logout();
