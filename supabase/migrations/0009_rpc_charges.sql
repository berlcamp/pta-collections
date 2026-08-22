-- 0009_rpc_charges.sql
-- Charge lifecycle: assessment, penalties, waiving, cancelling.

-- ---------------------------------------------------------------------------
-- pta.assess_annual_fees
--
-- Idempotent BY CONSTRUCTION: the partial unique index
-- student_charges_no_duplicate_assessment_idx makes `on conflict do nothing`
-- the whole duplicate-prevention story. Re-running assesses only the students
-- who were missed the first time — which is exactly what you want when a batch
-- of late enrollees arrives.
-- ---------------------------------------------------------------------------

create or replace function pta.assess_annual_fees(
  p_school_id      uuid,
  p_school_year_id uuid,
  p_fee_type_ids   uuid[],
  p_student_ids    uuid[] default null,
  p_due_date       date default null
)
returns table (created_count integer, skipped_count integer)
language plpgsql
security definer
set search_path = pta, public
as $$
declare
  v_created   integer := 0;
  v_targeted  integer := 0;
  v_profile   uuid := pta.current_profile_id();
begin
  perform pta.require_school_role(p_school_id, array['admin']);

  if p_fee_type_ids is null or array_length(p_fee_type_ids, 1) is null then
    raise exception 'Select at least one fee type to assess.';
  end if;

  -- Every fee type must belong to this school and be active.
  if exists (
    select 1 from unnest(p_fee_type_ids) ft_id
    where not exists (
      select 1 from pta.fee_types ft
      where ft.id = ft_id and ft.school_id = p_school_id and ft.active
    )
  ) then
    raise exception 'One or more fee types do not belong to this school or are inactive.'
      using errcode = '42501';
  end if;

  with targets as (
    select e.student_id
    from pta.student_enrollments e
    where e.school_id = p_school_id
      and e.school_year_id = p_school_year_id
      and e.status = 'enrolled'
      and (p_student_ids is null or e.student_id = any (p_student_ids))
  ),
  pairs as (
    select t.student_id, ft.id as fee_type_id, ft.default_amount, ft.name
    from targets t
    cross join pta.fee_types ft
    where ft.id = any (p_fee_type_ids)
  ),
  counted as (
    select count(*)::integer as n from pairs
  ),
  inserted as (
    insert into pta.student_charges (
      school_id, student_id, school_year_id, fee_type_id,
      description, amount, due_date, status, created_by
    )
    select p_school_id, p.student_id, p_school_year_id, p.fee_type_id,
           p.name, p.default_amount, p_due_date, 'active', v_profile
    from pairs p
    where p.default_amount is not null and p.default_amount > 0
    on conflict do nothing
    returning 1
  )
  select (select count(*) from inserted)::integer, (select n from counted)
    into v_created, v_targeted;

  perform pta.write_audit(
    p_school_id, 'FEES_ASSESSED', 'student_charge', null, null,
    jsonb_build_object(
      'school_year_id', p_school_year_id,
      'fee_type_ids', to_jsonb(p_fee_type_ids),
      'scope', case when p_student_ids is null then 'all_enrolled' else 'selected' end,
      'targeted', v_targeted,
      'created', v_created,
      'skipped', v_targeted - v_created
    )
  );

  created_count := v_created;
  skipped_count := v_targeted - v_created;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- pta.create_penalty — a one-off charge against a single student
-- ---------------------------------------------------------------------------

create or replace function pta.create_penalty(
  p_school_id      uuid,
  p_student_id     uuid,
  p_school_year_id uuid,
  p_fee_type_id    uuid,
  p_amount         numeric,
  p_description    text,
  p_due_date       date default null
)
returns uuid
language plpgsql
security definer
set search_path = pta, public
as $$
declare
  v_id uuid;
begin
  perform pta.require_school_role(p_school_id, array['admin', 'treasurer']);

  if p_amount is null or p_amount <= 0 then
    raise exception 'A penalty amount must be greater than zero.';
  end if;
  if p_description is null or length(trim(p_description)) = 0 then
    raise exception 'A penalty requires a description explaining the reason.';
  end if;
  if not exists (
    select 1 from pta.fee_types ft
    where ft.id = p_fee_type_id and ft.school_id = p_school_id and ft.active
  ) then
    raise exception 'Fee type does not belong to this school or is inactive.'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from pta.student_enrollments e
    where e.student_id = p_student_id
      and e.school_year_id = p_school_year_id
      and e.school_id = p_school_id
  ) then
    raise exception 'Student is not enrolled in this school year at this school.';
  end if;

  insert into pta.student_charges (
    school_id, student_id, school_year_id, fee_type_id,
    description, amount, due_date, status, created_by
  ) values (
    p_school_id, p_student_id, p_school_year_id, p_fee_type_id,
    trim(p_description), round(p_amount, 2), p_due_date, 'active', pta.current_profile_id()
  )
  returning id into v_id;

  perform pta.write_audit(
    p_school_id, 'CHARGE_CREATED', 'student_charge', v_id, null,
    jsonb_build_object('student_id', p_student_id, 'amount', p_amount,
                       'description', p_description, 'fee_type_id', p_fee_type_id)
  );

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- pta.waive_charge  (D15 — partial waivers are supported)
-- ---------------------------------------------------------------------------

create or replace function pta.waive_charge(
  p_charge_id uuid,
  p_amount    numeric,
  p_reason    text
)
returns void
language plpgsql
security definer
set search_path = pta, public
as $$
declare
  v_charge pta.student_charges;
  v_paid   numeric(12,2);
  v_amount numeric(12,2);
begin
  select * into v_charge from pta.student_charges where id = p_charge_id for update;
  if not found then
    raise exception 'Charge % does not exist.', p_charge_id;
  end if;

  perform pta.require_school_role(v_charge.school_id, array['admin']);

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Waiving a charge requires a reason.';
  end if;
  if v_charge.status <> 'active' then
    raise exception 'Charge is % and cannot be waived.', v_charge.status;
  end if;

  v_amount := round(coalesce(p_amount, v_charge.amount), 2);
  if v_amount <= 0 then
    raise exception 'Waived amount must be greater than zero.';
  end if;

  select b.paid into v_paid from pta.v_student_charge_balances b where b.id = p_charge_id;

  -- Cannot waive into negative territory: waived + already paid must not exceed
  -- the charge, or the books would show the PTA owing money it never took.
  if v_amount + v_paid > v_charge.amount then
    raise exception
      'Cannot waive %: the charge is % and % has already been paid.',
      v_amount, v_charge.amount, v_paid;
  end if;

  update pta.student_charges
     set waived_amount = v_amount,
         status        = case when v_amount >= amount then 'waived' else status end,
         status_reason = trim(p_reason)
   where id = p_charge_id;

  perform pta.write_audit(
    v_charge.school_id, 'CHARGE_WAIVED', 'student_charge', p_charge_id,
    jsonb_build_object('waived_amount', v_charge.waived_amount, 'status', v_charge.status),
    jsonb_build_object('waived_amount', v_amount, 'reason', trim(p_reason))
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- pta.cancel_charge
-- ---------------------------------------------------------------------------

create or replace function pta.cancel_charge(p_charge_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = pta, public
as $$
declare
  v_charge pta.student_charges;
  v_paid   numeric(12,2);
begin
  select * into v_charge from pta.student_charges where id = p_charge_id for update;
  if not found then
    raise exception 'Charge % does not exist.', p_charge_id;
  end if;

  perform pta.require_school_role(v_charge.school_id, array['admin']);

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Cancelling a charge requires a reason.';
  end if;

  select b.paid into v_paid from pta.v_student_charge_balances b where b.id = p_charge_id;
  if v_paid > 0 then
    raise exception
      'Cannot cancel a charge with % already paid against it. Void the payment first.', v_paid;
  end if;

  update pta.student_charges
     set status = 'cancelled', status_reason = trim(p_reason)
   where id = p_charge_id;

  perform pta.write_audit(
    v_charge.school_id, 'CHARGE_CANCELLED', 'student_charge', p_charge_id,
    jsonb_build_object('status', v_charge.status),
    jsonb_build_object('status', 'cancelled', 'reason', trim(p_reason))
  );
end;
$$;

revoke execute on function pta.assess_annual_fees(uuid, uuid, uuid[], uuid[], date) from public;
revoke execute on function pta.create_penalty(uuid, uuid, uuid, uuid, numeric, text, date) from public;
revoke execute on function pta.waive_charge(uuid, numeric, text) from public;
revoke execute on function pta.cancel_charge(uuid, text) from public;

grant execute on function pta.assess_annual_fees(uuid, uuid, uuid[], uuid[], date) to authenticated;
grant execute on function pta.create_penalty(uuid, uuid, uuid, uuid, numeric, text, date) to authenticated;
grant execute on function pta.waive_charge(uuid, numeric, text) to authenticated;
grant execute on function pta.cancel_charge(uuid, text) to authenticated;
