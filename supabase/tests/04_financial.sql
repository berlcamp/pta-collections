-- 04_financial.sql — the money path: allocation, overpayment, receipts, voids,
-- idempotency, waivers, and the derived-balance view.

\set A_ADMIN   '''22222222-2222-2222-2222-222222222222'''
\set A_CASHIER '''33333333-3333-3333-3333-333333333333'''
\set A_TREAS   '''44444444-4444-4444-4444-444444444444'''
\set B_ADMIN   '''55555555-5555-5555-5555-555555555555'''
\set SUPER     '''11111111-1111-1111-1111-111111111111'''

-- ---------------------------------------------------------------------------
-- Assessment idempotency (D-v1 §34.12)
-- ---------------------------------------------------------------------------
select pta_test.login(:A_ADMIN::uuid);

select pta_test.eq((select count(*) from pta.student_charges)::int, 6,
  'A1. Assessment created 3 students x 2 annual fees = 6 charges');

-- Re-run the exact same assessment.
create temp table _reassess as
select * from pta.assess_annual_fees(
  (select id from pta.schools where school_code = 'ONHS'),
  (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
    where s.school_code = 'ONHS'),
  array(select ft.id from pta.fee_types ft join pta.schools s on s.id = ft.school_id
        where s.school_code = 'ONHS' and ft.category = 'annual'));

select pta_test.eq((select created_count from _reassess), 0,
  'A2. Re-running the assessment creates nothing');
select pta_test.eq((select skipped_count from _reassess), 6,
  'A3. Re-running the assessment reports 6 skipped');
select pta_test.eq((select count(*) from pta.student_charges)::int, 6,
  'A4. Charge count is unchanged after re-assessment');

-- A penalty on Juan.
select pta.create_penalty(
  (select id from pta.schools where school_code = 'ONHS'),
  (select id from pta.students where first_name = 'Juan' and school_id =
    (select id from pta.schools where school_code = 'ONHS')),
  (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
    where s.school_code = 'ONHS'),
  (select ft.id from pta.fee_types ft join pta.schools s on s.id = ft.school_id
    where s.school_code = 'ONHS' and ft.name = 'Lost ID'),
  100.00, 'Lost school identification card');

select pta_test.logout();

-- ---------------------------------------------------------------------------
-- Juan now owes 100 + 50 + 100 = 250 (the v1 §13 worked example)
-- ---------------------------------------------------------------------------
select pta_test.login(:A_CASHIER::uuid);

create temp view _juan as
  select id from pta.students
  where first_name = 'Juan'
    and school_id = (select id from pta.schools where school_code = 'ONHS');

select pta_test.eq(
  (select sum(balance) from pta.v_student_charge_balances
    where student_id = (select id from _juan)), 250.00::numeric,
  'B1. Juan owes 250.00 in total');

-- Partial payment of 150 across two charges (100 + 50).
create temp table _pay1 as
select * from pta.create_payment(
  (select id from pta.schools where school_code = 'ONHS'),
  (select id from _juan),
  (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
    where s.school_code = 'ONHS'),
  'cash',
  (select jsonb_agg(jsonb_build_object('charge_id', b.id, 'amount', b.balance))
   from pta.v_student_charge_balances b
   where b.student_id = (select id from _juan) and b.fee_category = 'annual'),
  null, null, 200.00, 'idem-key-001');

select pta_test.eq((select total_amount from _pay1), 150.00::numeric,
  'B2. The payment total is the SUM OF THE LINES, not a client-supplied number');
select pta_test.eq((select receipt_number from _pay1), 'ONHS-2026-000001',
  'B3. Receipt number is ONHS-2026-000001');
select pta_test.eq(
  (select change_amount from pta.payments where id = (select payment_id from _pay1)),
  50.00::numeric,
  'B4. Change from 200.00 tendered is 50.00');
select pta_test.eq(
  (select sum(balance) from pta.v_student_charge_balances
    where student_id = (select id from _juan)), 100.00::numeric,
  'B5. Outstanding drops to 100.00 (the penalty)');
select pta_test.eq(
  (select count(*) from pta.v_student_charge_balances
    where student_id = (select id from _juan) and payment_status = 'paid')::int, 2,
  'B6. Two charges are derived as fully paid');

-- Idempotency: replaying the same key must return the SAME payment, not a new one.
create temp table _pay1replay as
select * from pta.create_payment(
  (select id from pta.schools where school_code = 'ONHS'),
  (select id from _juan),
  (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
    where s.school_code = 'ONHS'),
  'cash', '[]'::jsonb, null, null, null, 'idem-key-001');

select pta_test.eq((select payment_id from _pay1replay), (select payment_id from _pay1),
  'B7. Replaying an idempotency key returns the original payment');
select pta_test.eq((select count(*) from pta.payments)::int, 1,
  'B8. A replayed submit does not create a second payment');

-- ---------------------------------------------------------------------------
-- Overpayment is rejected IN THE DATABASE (D13)
-- ---------------------------------------------------------------------------
select pta_test.throws(
  format($f$select pta.create_payment(
    %L::uuid, %L::uuid, %L::uuid, 'cash',
    '[{"charge_id":"%s","amount":100.01}]'::jsonb)$f$,
    (select id from pta.schools where school_code = 'ONHS'),
    (select id from _juan),
    (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
      where s.school_code = 'ONHS'),
    (select b.id from pta.v_student_charge_balances b
      where b.student_id = (select id from _juan) and b.balance > 0 limit 1)),
  'C1. Paying 100.01 against a 100.00 balance is rejected');

select pta_test.throws(
  format($f$select pta.create_payment(
    %L::uuid, %L::uuid, %L::uuid, 'cash',
    '[{"charge_id":"%s","amount":50}]'::jsonb)$f$,
    (select id from pta.schools where school_code = 'ONHS'),
    (select id from _juan),
    (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
      where s.school_code = 'ONHS'),
    (select b.id from pta.v_student_charge_balances b
      where b.student_id = (select id from _juan) and b.payment_status = 'paid' limit 1)),
  'C2. Paying again against an already-settled charge is rejected');

select pta_test.throws(
  format($f$select pta.create_payment(%L::uuid, %L::uuid, %L::uuid, 'cash', '[]'::jsonb)$f$,
    (select id from pta.schools where school_code = 'ONHS'),
    (select id from _juan),
    (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
      where s.school_code = 'ONHS')),
  'C3. A payment with no lines is rejected');

select pta_test.throws(
  format($f$select pta.create_payment(
    %L::uuid, %L::uuid, %L::uuid, 'gcash',
    '[{"charge_id":"%s","amount":10}]'::jsonb, null, null, 500)$f$,
    (select id from pta.schools where school_code = 'ONHS'),
    (select id from _juan),
    (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
      where s.school_code = 'ONHS'),
    (select b.id from pta.v_student_charge_balances b
      where b.student_id = (select id from _juan) and b.balance > 0 limit 1)),
  'C4. Amount tendered on a non-cash payment is rejected');

-- ---------------------------------------------------------------------------
-- Receipt sequencing, per school (D18)
-- ---------------------------------------------------------------------------
create temp table _pay2 as
select * from pta.create_payment(
  (select id from pta.schools where school_code = 'ONHS'),
  (select id from _juan),
  (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
    where s.school_code = 'ONHS'),
  'gcash',
  (select jsonb_agg(jsonb_build_object('charge_id', b.id, 'amount', 40))
   from pta.v_student_charge_balances b
   where b.student_id = (select id from _juan) and b.balance > 0),
  'GC-99887', 'partial on penalty');

select pta_test.eq((select receipt_number from _pay2), 'ONHS-2026-000002',
  'D1. The next receipt in School A is ONHS-2026-000002');
select pta_test.eq(
  (select payment_status from pta.v_student_charge_balances
    where student_id = (select id from _juan) and fee_category = 'penalty'),
  'partially_paid',
  'D2. A 40.00 payment on a 100.00 penalty derives as partially_paid');

-- A cashier must NOT be able to void (D14/D22).
select pta_test.throws(
  format($f$select pta.void_payment(%L::uuid, 'testing')$f$, (select payment_id from _pay2)),
  'D3. A cashier cannot void a payment');
select pta_test.logout();

-- School B's first receipt is -000001 too: numbering is school-scoped.
select pta_test.login(:B_ADMIN::uuid);
create temp table _payb as
select * from pta.create_payment(
  (select id from pta.schools where school_code = 'TNHS'),
  (select st.id from pta.students st join pta.schools s on s.id = st.school_id
    where s.school_code = 'TNHS' limit 1),
  (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
    where s.school_code = 'TNHS'),
  'cash',
  (select jsonb_agg(jsonb_build_object('charge_id', b.id, 'amount', 150))
   from pta.v_student_charge_balances b
   join pta.schools s on s.id = b.school_id where s.school_code = 'TNHS'));

select pta_test.eq((select receipt_number from _payb), 'TNHS-2026-000001',
  'D4. School B starts its own sequence at TNHS-2026-000001');
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- Voiding (D14)
-- ---------------------------------------------------------------------------
select pta_test.login(:A_TREAS::uuid);

select pta_test.throws(
  format($f$select pta.void_payment(%L::uuid, '   ')$f$, (select payment_id from _pay2)),
  'E1. Voiding without a reason is rejected');

select pta.void_payment((select payment_id from _pay2), 'Wrong student');

select pta_test.eq(
  (select status from pta.payments where id = (select payment_id from _pay2)), 'voided',
  'E2. The payment is voided');
select pta_test.eq(
  (select sum(balance) from pta.v_student_charge_balances
    where student_id = (select id from pta.students where first_name = 'Juan'
      and school_id = (select id from pta.schools where school_code = 'ONHS'))),
  100.00::numeric,
  'E3. Voiding restores the balance to 100.00');
select pta_test.eq(
  (select count(*) from pta.payment_items where payment_id = (select payment_id from _pay2))::int,
  1,
  'E4. payment_items are preserved as history, not deleted');
select pta_test.throws(
  format($f$select pta.void_payment(%L::uuid, 'again')$f$, (select payment_id from _pay2)),
  'E5. Voiding twice is rejected — voids are irreversible');

select pta_test.eq(
  (select coalesce(sum(total), 0) from pta.v_daily_collections
   where school_id = (select id from pta.schools where school_code = 'ONHS')),
  150.00::numeric,
  'E6. A voided payment is excluded from daily collections');

-- The receipt number stays consumed forever (D18).
create temp table _pay3 as
select * from pta.create_payment(
  (select id from pta.schools where school_code = 'ONHS'),
  (select id from pta.students where first_name = 'Juan'
    and school_id = (select id from pta.schools where school_code = 'ONHS')),
  (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
    where s.school_code = 'ONHS'),
  'cash',
  (select jsonb_agg(jsonb_build_object('charge_id', b.id, 'amount', 100))
   from pta.v_student_charge_balances b
   where b.student_id = (select id from pta.students where first_name = 'Juan'
     and school_id = (select id from pta.schools where school_code = 'ONHS'))
     and b.balance > 0));

select pta_test.eq((select receipt_number from _pay3), 'ONHS-2026-000003',
  'E7. The voided receipt number 000002 is never reissued');
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- Waiving (D15) — partial waivers must work
-- ---------------------------------------------------------------------------
select pta_test.login(:A_ADMIN::uuid);

create temp view _pedro as
  select id from pta.students where first_name = 'Pedro'
    and school_id = (select id from pta.schools where school_code = 'ONHS');

select pta.waive_charge(
  (select b.id from pta.v_student_charge_balances b
   where b.student_id = (select id from _pedro) and b.amount = 100.00 limit 1),
  50.00, 'Second sibling discount');

select pta_test.eq(
  (select balance from pta.v_student_charge_balances
   where student_id = (select id from _pedro) and amount = 100.00), 50.00::numeric,
  'F1. A 50.00 partial waiver leaves a 50.00 balance');
select pta_test.eq(
  (select payment_status from pta.v_student_charge_balances
   where student_id = (select id from _pedro) and amount = 100.00), 'unpaid',
  'F2. A partially waived, unpaid charge still reads as unpaid');

select pta_test.throws(
  format($f$select pta.waive_charge(%L::uuid, 50, '')$f$,
    (select b.id from pta.v_student_charge_balances b
     where b.student_id = (select id from _pedro) and b.amount = 50.00 limit 1)),
  'F3. Waiving without a reason is rejected');

-- Cancelling a charge that has money against it must be refused.
select pta_test.throws(
  format($f$select pta.cancel_charge(%L::uuid, 'oops')$f$,
    (select b.id from pta.v_student_charge_balances b
     where b.student_id = (select id from pta.students where first_name = 'Juan'
       and school_id = (select id from pta.schools where school_code = 'ONHS'))
       and b.paid > 0 limit 1)),
  'F4. Cancelling a charge with payments against it is rejected');

select pta_test.logout();

-- ---------------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------------
select pta_test.login(:A_ADMIN::uuid);
select pta_test.ok(
  exists (select 1 from pta.audit_logs where action = 'PAYMENT_CREATED'),
  'G1. Payment creation is audited');
select pta_test.ok(
  exists (select 1 from pta.audit_logs where action = 'PAYMENT_VOIDED'
          and new_values ->> 'void_reason' = 'Wrong student'),
  'G2. The void reason is captured in the audit log');
select pta_test.ok(
  exists (select 1 from pta.audit_logs where action = 'FEES_ASSESSED'),
  'G3. Fee assessment is audited');
select pta_test.logout();

-- A super admin acting inside a school is stamped as such.
select pta_test.login(:SUPER::uuid);
create temp table _paysuper as
select * from pta.create_payment(
  (select id from pta.schools where school_code = 'ONHS'),
  (select id from pta.students where first_name = 'Maria'
    and school_id = (select id from pta.schools where school_code = 'ONHS')),
  (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
    where s.school_code = 'ONHS'),
  'cash',
  (select jsonb_agg(jsonb_build_object('charge_id', b.id, 'amount', b.balance))
   from pta.v_student_charge_balances b
   where b.student_id = (select id from pta.students where first_name = 'Maria'
     and school_id = (select id from pta.schools where school_code = 'ONHS'))
     and b.balance > 0));

select pta_test.ok(
  (select acting_as_super_admin from pta.payments where id = (select payment_id from _paysuper)),
  'G4. A Super Admin payment is stamped acting_as_super_admin');
select pta_test.ok(
  (select acting_as_super_admin from pta.audit_logs
   where entity_id = (select payment_id from _paysuper) and action = 'PAYMENT_CREATED'),
  'G5. The audit row records that the Super Admin was acting inside the school');
select pta_test.logout();
