-- 0008_rpc_payments.sql
-- The money path. pta.create_payment and pta.void_payment.
--
-- These are the ONLY writers of pta.payments and pta.payment_items — there is no
-- insert/update policy on either table (see 0006). Everything is validated here,
-- inside one transaction, against locked rows.

-- ---------------------------------------------------------------------------
-- pta.create_payment
--
-- p_items: [{"charge_id": "...", "amount": 123.45}, ...]
--
-- The caller's idea of the total is IGNORED. total_amount is the sum of the
-- lines (D13), which removes the whole "total does not match items" bug class.
-- ---------------------------------------------------------------------------

create or replace function pta.create_payment(
  p_school_id        uuid,
  p_student_id       uuid,
  p_school_year_id   uuid,
  p_payment_method   text,
  p_items            jsonb,
  p_reference_number text default null,
  p_remarks          text default null,
  p_amount_tendered  numeric default null,
  p_idempotency_key  text default null
)
returns table (payment_id uuid, receipt_number text, total_amount numeric)
language plpgsql
security definer
set search_path = pta, public
as $$
declare
  v_profile_id  uuid := pta.current_profile_id();
  v_total       numeric(12,2) := 0;
  v_change      numeric(12,2);
  v_seq         integer;
  v_prefix      text;
  v_year        text;
  v_receipt     text;
  v_payment_id  uuid;
  v_existing    record;
  v_item        record;
  v_remaining   numeric(12,2);
  v_acting      boolean;
begin
  -- 1. Authorization.
  perform pta.require_school_role(p_school_id, array['admin', 'cashier', 'treasurer']);

  if v_profile_id is null then
    raise exception 'No profile for the current user.' using errcode = '42501';
  end if;

  -- 2. Idempotency: a double-clicked form must not create two payments.
  if p_idempotency_key is not null then
    select p.id, p.receipt_number, p.total_amount into v_existing
    from pta.payments p
    where p.school_id = p_school_id and p.idempotency_key = p_idempotency_key;

    if found then
      payment_id := v_existing.id;
      receipt_number := v_existing.receipt_number;
      total_amount := v_existing.total_amount;
      return next;
      return;
    end if;
  end if;

  if p_payment_method not in ('cash', 'gcash', 'bank_transfer', 'other') then
    raise exception 'Invalid payment method: %', p_payment_method;
  end if;

  -- 3. The student must actually be enrolled in this year at this school.
  if not exists (
    select 1 from pta.student_enrollments e
    where e.student_id = p_student_id
      and e.school_year_id = p_school_year_id
      and e.school_id = p_school_id
  ) then
    raise exception 'Student % is not enrolled in this school year at this school.', p_student_id;
  end if;

  -- 4. There must be at least one line.
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A payment must allocate to at least one charge.';
  end if;

  -- 5. Lock the charges, then validate each line against a FRESHLY computed
  --    remaining balance. This is the overpayment guard (D13) and it lives here,
  --    in the database, not in the UI.
  create temp table _lines (
    charge_id uuid primary key,
    amount    numeric(12,2) not null
  ) on commit drop;

  insert into _lines (charge_id, amount)
  select (elem ->> 'charge_id')::uuid, round((elem ->> 'amount')::numeric, 2)
  from jsonb_array_elements(p_items) elem;

  if exists (select 1 from _lines where amount <= 0) then
    raise exception 'Every payment line must be greater than zero.';
  end if;

  -- Lock the charge rows for the duration of the transaction.
  perform 1
  from pta.student_charges c
  where c.id in (select charge_id from _lines)
  order by c.id
  for update;

  for v_item in select * from _lines loop
    declare
      v_charge pta.student_charges;
    begin
      select * into v_charge from pta.student_charges where id = v_item.charge_id;

      if not found then
        raise exception 'Charge % does not exist.', v_item.charge_id;
      end if;
      if v_charge.school_id <> p_school_id then
        raise exception 'Charge % belongs to another school.', v_item.charge_id
          using errcode = '42501';
      end if;
      if v_charge.student_id <> p_student_id or v_charge.school_year_id <> p_school_year_id then
        raise exception 'Charge % does not belong to this student and school year.', v_item.charge_id;
      end if;
      if v_charge.status <> 'active' then
        raise exception 'Charge % is % and cannot be paid.', v_item.charge_id, v_charge.status;
      end if;

      select b.balance into v_remaining
      from pta.v_student_charge_balances b where b.id = v_item.charge_id;

      if v_item.amount > v_remaining then
        raise exception
          'Overpayment rejected: % exceeds the remaining balance of % on charge %.',
          v_item.amount, v_remaining, v_item.charge_id;
      end if;

      v_total := v_total + v_item.amount;
    end;
  end loop;

  if v_total <= 0 then
    raise exception 'Payment total must be greater than zero.';
  end if;

  -- 6. Tendered/change. Informational only — creates no credit balance (D13).
  if p_amount_tendered is not null then
    if p_payment_method <> 'cash' then
      raise exception 'Amount tendered applies to cash payments only.';
    end if;
    if p_amount_tendered < v_total then
      raise exception 'Amount tendered (%) is less than the payment total (%).',
        p_amount_tendered, v_total;
    end if;
    v_change := p_amount_tendered - v_total;
  end if;

  -- 7. Receipt number (D18). Lock the counter row; gaps on rollback are expected.
  insert into pta.receipt_counters (school_id, school_year_id, next_seq)
  values (p_school_id, p_school_year_id, 1)
  on conflict (school_id, school_year_id) do nothing;

  select rc.next_seq into v_seq
  from pta.receipt_counters rc
  where rc.school_id = p_school_id and rc.school_year_id = p_school_year_id
  for update;

  select s.receipt_prefix into v_prefix from pta.schools s where s.id = p_school_id;
  select left(sy.name, 4) into v_year from pta.school_years sy where sy.id = p_school_year_id;

  v_receipt := v_prefix || '-' || v_year || '-' || lpad(v_seq::text, 6, '0');

  update pta.receipt_counters
     set next_seq = next_seq + 1
   where school_id = p_school_id and school_year_id = p_school_year_id;

  -- 8. Insert the payment and its items.
  v_acting := pta.acting_as_super_admin(p_school_id);

  insert into pta.payments (
    school_id, receipt_number, student_id, school_year_id, payment_date,
    total_amount, amount_tendered, change_amount, payment_method,
    reference_number, remarks, collected_by, status,
    acting_as_super_admin, idempotency_key
  ) values (
    p_school_id, v_receipt, p_student_id, p_school_year_id, now(),
    v_total, p_amount_tendered, v_change, p_payment_method,
    nullif(trim(coalesce(p_reference_number, '')), ''),
    nullif(trim(coalesce(p_remarks, '')), ''),
    v_profile_id, 'posted', v_acting, p_idempotency_key
  )
  returning id into v_payment_id;

  insert into pta.payment_items (school_id, payment_id, student_charge_id, amount)
  select p_school_id, v_payment_id, l.charge_id, l.amount from _lines l;

  -- 9. Audit with the full breakdown.
  perform pta.write_audit(
    p_school_id, 'PAYMENT_CREATED', 'payment', v_payment_id, null,
    jsonb_build_object(
      'receipt_number', v_receipt,
      'student_id', p_student_id,
      'school_year_id', p_school_year_id,
      'total_amount', v_total,
      'payment_method', p_payment_method,
      'reference_number', p_reference_number,
      'items', (select jsonb_agg(jsonb_build_object('charge_id', charge_id, 'amount', amount))
                from _lines)
    )
  );

  payment_id := v_payment_id;
  receipt_number := v_receipt;
  total_amount := v_total;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- pta.void_payment  (D14)
--
-- Whole payment only. Admin or treasurer. Reason mandatory. Irreversible.
-- payment_items are NOT touched: the allocation is history, and the views
-- exclude voided payments, so balances correct themselves.
-- The receipt number is never released or reused (D18).
-- ---------------------------------------------------------------------------

create or replace function pta.void_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = pta, public
as $$
declare
  v_payment pta.payments;
begin
  select * into v_payment from pta.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment % does not exist.', p_payment_id;
  end if;

  -- Cashiers cannot void (D14/D22). That is the real control on the cashier role.
  perform pta.require_school_role(v_payment.school_id, array['admin', 'treasurer']);

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A void requires a reason.';
  end if;

  if v_payment.status = 'voided' then
    raise exception 'Payment % is already voided. Voids are irreversible and not repeatable.',
      v_payment.receipt_number;
  end if;

  update pta.payments
     set status      = 'voided',
         voided_at   = now(),
         voided_by   = pta.current_profile_id(),
         void_reason = trim(p_reason)
   where id = p_payment_id;

  perform pta.write_audit(
    v_payment.school_id, 'PAYMENT_VOIDED', 'payment', p_payment_id,
    jsonb_build_object('status', 'posted',
                       'receipt_number', v_payment.receipt_number,
                       'total_amount', v_payment.total_amount),
    jsonb_build_object('status', 'voided', 'void_reason', trim(p_reason))
  );
end;
$$;

revoke execute on function pta.create_payment(uuid, uuid, uuid, text, jsonb, text, text, numeric, text) from public;
revoke execute on function pta.void_payment(uuid, text) from public;
grant execute on function pta.create_payment(uuid, uuid, uuid, text, jsonb, text, text, numeric, text) to authenticated;
grant execute on function pta.void_payment(uuid, text) to authenticated;
