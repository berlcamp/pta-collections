-- 0004_views.sql
-- Reporting views. These are the ONLY place balances are computed (D15).
-- Nothing in TypeScript recalculates a balance.
--
-- Every money sum here excludes payments.status = 'voided' (v1 §34.14-15).
-- Every day/month bucket is computed in the school's timezone, not UTC (D11).

-- security_invoker so the caller's RLS applies to the underlying tables.
-- Without it a view owned by a privileged role would bypass tenant isolation.

-- ---------------------------------------------------------------------------
-- v_student_charge_balances — the single source of truth (D15)
-- ---------------------------------------------------------------------------

create or replace view pta.v_student_charge_balances
with (security_invoker = true) as
select
  c.id,
  c.school_id,
  c.student_id,
  c.school_year_id,
  c.fee_type_id,
  ft.name        as fee_type_name,
  ft.category    as fee_category,
  c.description,
  c.amount,
  c.waived_amount,
  c.due_date,
  c.status,
  c.status_reason,
  c.created_at,
  coalesce(paid.total, 0)                                    as paid,
  greatest(c.amount - c.waived_amount - coalesce(paid.total, 0), 0) as balance,
  case
    when c.status = 'cancelled' then 'cancelled'
    when c.status = 'waived' or c.waived_amount >= c.amount then 'waived'
    when coalesce(paid.total, 0) <= 0 then 'unpaid'
    when c.amount - c.waived_amount - coalesce(paid.total, 0) <= 0 then 'paid'
    else 'partially_paid'
  end as payment_status
from pta.student_charges c
join pta.fee_types ft on ft.id = c.fee_type_id
left join lateral (
  select sum(pi.amount) as total
  from pta.payment_items pi
  join pta.payments p on p.id = pi.payment_id
  where pi.student_charge_id = c.id
    and p.status = 'posted'          -- voided payments never count
) paid on true;

-- ---------------------------------------------------------------------------
-- v_student_financials — per student, per school year
-- ---------------------------------------------------------------------------

create or replace view pta.v_student_financials
with (security_invoker = true) as
select
  b.school_id,
  b.student_id,
  b.school_year_id,
  coalesce(sum(b.amount)        filter (where b.status <> 'cancelled'), 0) as total_charged,
  coalesce(sum(b.waived_amount) filter (where b.status <> 'cancelled'), 0) as total_waived,
  coalesce(sum(b.paid)          filter (where b.status <> 'cancelled'), 0) as total_paid,
  coalesce(sum(b.balance)       filter (where b.status = 'active'),     0) as outstanding,
  count(*) filter (where b.status <> 'cancelled')                          as charge_count
from pta.v_student_charge_balances b
group by b.school_id, b.student_id, b.school_year_id;

-- ---------------------------------------------------------------------------
-- v_payments_local — payments with the school-local calendar date attached (D11)
--
-- Every daily/monthly report reads collection_date from here. Do NOT bucket
-- payment_date in JavaScript: a cashier's mis-set tablet would then disagree
-- with the treasurer's report.
-- ---------------------------------------------------------------------------

create or replace view pta.v_payments_local
with (security_invoker = true) as
select
  p.*,
  (p.payment_date at time zone s.timezone)::date            as collection_date,
  date_trunc('month', p.payment_date at time zone s.timezone)::date as collection_month,
  s.timezone                                                as school_timezone
from pta.payments p
join pta.schools s on s.id = p.school_id;

-- ---------------------------------------------------------------------------
-- v_daily_collections
-- ---------------------------------------------------------------------------

create or replace view pta.v_daily_collections
with (security_invoker = true) as
select
  p.school_id,
  p.school_year_id,
  p.collection_date,
  p.payment_method,
  p.collected_by,
  sum(p.total_amount) as total,
  count(*)            as receipt_count
from pta.v_payments_local p
where p.status = 'posted'
group by p.school_id, p.school_year_id, p.collection_date, p.payment_method, p.collected_by;

-- ---------------------------------------------------------------------------
-- v_monthly_collections
-- ---------------------------------------------------------------------------

create or replace view pta.v_monthly_collections
with (security_invoker = true) as
select
  p.school_id,
  p.school_year_id,
  p.collection_month,
  sum(p.total_amount) as total,
  count(*)            as receipt_count
from pta.v_payments_local p
where p.status = 'posted'
group by p.school_id, p.school_year_id, p.collection_month;

-- ---------------------------------------------------------------------------
-- v_collections_by_fee_type
--
-- Allocated at the ITEM level, so a payment spanning three fee types is split
-- across them correctly rather than attributed to one.
-- ---------------------------------------------------------------------------

create or replace view pta.v_collections_by_fee_type
with (security_invoker = true) as
select
  p.school_id,
  p.school_year_id,
  ft.id       as fee_type_id,
  ft.name     as fee_type_name,
  ft.category as fee_category,
  p.collection_date,
  p.payment_method,
  p.collected_by,
  sum(pi.amount) as total,
  count(distinct p.id) as receipt_count
from pta.payment_items pi
join pta.v_payments_local p on p.id = pi.payment_id
join pta.student_charges c  on c.id = pi.student_charge_id
join pta.fee_types ft       on ft.id = c.fee_type_id
where p.status = 'posted'
group by p.school_id, p.school_year_id, ft.id, ft.name, ft.category,
         p.collection_date, p.payment_method, p.collected_by;

-- ---------------------------------------------------------------------------
-- v_outstanding_dues
--
-- D25: a transferred-out student KEEPS their charges. student_status is exposed
-- so reports can default to active students while still allowing the full list.
-- ---------------------------------------------------------------------------

create or replace view pta.v_outstanding_dues
with (security_invoker = true) as
select
  b.school_id,
  b.school_year_id,
  b.id as charge_id,
  b.student_id,
  st.first_name, st.middle_name, st.last_name, st.suffix,
  st.status        as student_status,
  e.grade_level,
  sec.name         as section_name,
  e.student_number,
  b.fee_type_name,
  b.fee_category,
  b.description,
  b.amount,
  b.waived_amount,
  b.paid,
  b.balance,
  b.due_date,
  b.payment_status,
  g.first_name || ' ' || g.last_name as primary_guardian_name,
  g.contact_number                   as primary_guardian_contact
from pta.v_student_charge_balances b
join pta.students st on st.id = b.student_id
join pta.student_enrollments e
  on e.student_id = b.student_id and e.school_year_id = b.school_year_id
left join pta.sections sec on sec.id = e.section_id
left join lateral (
  select pg.first_name, pg.last_name, pg.contact_number
  from pta.student_guardians sg
  join pta.parents_guardians pg on pg.id = sg.guardian_id
  where sg.student_id = b.student_id
  order by sg.is_primary desc, sg.created_at
  limit 1
) g on true
where b.status = 'active' and b.balance > 0;

-- ---------------------------------------------------------------------------
-- v_student_payment_status — one row per enrolled student per year
-- ---------------------------------------------------------------------------

create or replace view pta.v_student_payment_status
with (security_invoker = true) as
select
  e.school_id,
  e.school_year_id,
  e.student_id,
  st.first_name, st.middle_name, st.last_name, st.suffix,
  st.status as student_status,
  e.grade_level,
  sec.name  as section_name,
  e.student_number,
  e.status  as enrollment_status,
  coalesce(f.total_charged, 0) as total_charged,
  coalesce(f.total_waived, 0)  as total_waived,
  coalesce(f.total_paid, 0)    as total_paid,
  coalesce(f.outstanding, 0)   as outstanding,
  case
    when coalesce(f.total_charged, 0) = 0 then 'not_assessed'
    when coalesce(f.outstanding, 0) <= 0  then 'fully_paid'
    when coalesce(f.total_paid, 0) > 0    then 'partially_paid'
    else 'unpaid'
  end as status
from pta.student_enrollments e
join pta.students st on st.id = e.student_id
left join pta.sections sec on sec.id = e.section_id
left join pta.v_student_financials f
  on f.student_id = e.student_id and f.school_year_id = e.school_year_id;

-- ---------------------------------------------------------------------------
-- v_cashier_collections
-- ---------------------------------------------------------------------------

create or replace view pta.v_cashier_collections
with (security_invoker = true) as
select
  p.school_id,
  p.school_year_id,
  p.collected_by,
  pr.full_name as cashier_name,
  p.collection_date,
  sum(p.total_amount)                                                  as total,
  sum(p.total_amount) filter (where p.payment_method = 'cash')         as cash_total,
  sum(p.total_amount) filter (where p.payment_method = 'gcash')        as gcash_total,
  sum(p.total_amount) filter (where p.payment_method = 'bank_transfer') as bank_total,
  sum(p.total_amount) filter (where p.payment_method = 'other')        as other_total,
  count(*)                                                             as receipt_count
from pta.v_payments_local p
join pta.profiles pr on pr.id = p.collected_by
where p.status = 'posted'
group by p.school_id, p.school_year_id, p.collected_by, pr.full_name, p.collection_date;
