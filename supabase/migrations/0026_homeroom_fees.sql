-- 0026_homeroom_fees.sql — fees for one grade or one section, and a report by section.
--
-- A homeroom contribution is a fee the PTA collects for one room: Grade 7
-- Rizal's ₱200 toward its electric fan, Grade 7 Mabini's ₱150 toward its
-- curtains. Until now a fee was assessed to every enrolled student or, through
-- the penalty dialog, to one student at a time. This adds the missing middle.
--
-- It is still an ordinary student_charge. The PTA keeps the money, so it is
-- paid at the cashier or through the portal, numbered from the same receipt
-- series and counted in the same daily report as any other fee. That is the
-- point: a homeroom collection that went through its own path would be cash
-- nobody could reconcile. It is NOT a donation (0014) — it is owed, it sits
-- on the parent's balance, and it needs an enrollment.
--
-- Three things:
--
--   1. A 'homeroom' fee category, so these show and report as their own kind
--      of fee rather than hiding under 'special' or, worse, 'penalty'.
--
--   2. pta.assess_fees_scoped(): assess_annual_fees() with a scope (whole
--      school, some grades, or some sections) and an optional amount that
--      overrides the fee's default. The scope is resolved HERE, from
--      student_enrollments, rather than as a student list from TypeScript —
--      the server, not the browser, decides who is in Grade 7 Rizal, and a
--      late enrollee assessed on a second run is found the same way.
--
--      The amount override exists so ONE "Homeroom contribution" fee type can
--      carry a different amount per room. It is allowed only with exactly one
--      fee type selected, because one number cannot sensibly override three
--      different fees. Idempotency is unchanged: the partial unique index on
--      (student, year, fee type) still allows one live charge, so a section
--      assessed twice — even at a different amount — keeps its first charges.
--      A wrong amount is fixed by cancelling and re-assessing, which leaves
--      an audit trail; silently repricing a charge someone has part-paid
--      would not.
--
--      assess_annual_fees() is left exactly as it was. Nothing calls it from
--      the app after this migration, but the SQL suite does, and an applied
--      function is history.
--
--   3. pta.v_section_charge_summary: per section, per fee type, what was
--      charged, collected and still owed, and how many students still owe.
--      It reads v_student_charge_balances (D15: the balance is derived in one
--      place and only one) and is security_invoker like every staff view, so
--      RLS on the base tables scopes it to the caller's schools.

-- ---------------------------------------------------------------------------
-- 1. The category
-- ---------------------------------------------------------------------------

alter table pta.fee_types drop constraint fee_types_category_check;
alter table pta.fee_types add constraint fee_types_category_check
  check (category in ('annual', 'penalty', 'special', 'other', 'homeroom'));

-- ---------------------------------------------------------------------------
-- 2. pta.assess_fees_scoped
-- ---------------------------------------------------------------------------

create or replace function pta.assess_fees_scoped(
  p_school_id      uuid,
  p_school_year_id uuid,
  p_fee_type_ids   uuid[],
  p_grade_levels   text[]  default null,
  p_section_ids    uuid[]  default null,
  p_amount         numeric default null,
  p_due_date       date    default null
)
returns table (created_count integer, skipped_count integer)
language plpgsql
security definer
set search_path = pta, public
as $$
declare
  v_created  integer := 0;
  v_targeted integer := 0;
  v_profile  uuid := pta.current_profile_id();
  v_grades   text[] := nullif(p_grade_levels, '{}');
  v_sections uuid[] := nullif(p_section_ids, '{}');
begin
  perform pta.require_school_role(p_school_id, array['admin']);

  if p_fee_type_ids is null or array_length(p_fee_type_ids, 1) is null then
    raise exception 'Select at least one fee type to assess.';
  end if;

  if v_grades is not null and v_sections is not null then
    raise exception 'Choose grades or sections, not both.';
  end if;

  if not exists (
    select 1 from pta.school_years sy
    where sy.id = p_school_year_id and sy.school_id = p_school_id
  ) then
    raise exception 'That school year does not belong to this school.'
      using errcode = '42501';
  end if;

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

  -- A section from another school, or from another year of this one, would
  -- simply match no enrollment and assess nobody. Say so instead.
  if v_sections is not null and exists (
    select 1 from unnest(v_sections) s_id
    where not exists (
      select 1 from pta.sections s
      where s.id = s_id
        and s.school_id = p_school_id
        and s.school_year_id = p_school_year_id
    )
  ) then
    raise exception 'One or more sections are not in this school year.'
      using errcode = '42501';
  end if;

  if p_amount is not null then
    if (select count(distinct x) from unnest(p_fee_type_ids) x) <> 1 then
      raise exception 'An amount can only be set when assessing a single fee type.';
    end if;
    if p_amount <= 0 or p_amount > 9999999.99 then
      raise exception 'The amount must be greater than zero.';
    end if;
  end if;

  with targets as (
    select e.student_id
    from pta.student_enrollments e
    where e.school_id = p_school_id
      and e.school_year_id = p_school_year_id
      and e.status = 'enrolled'
      and (v_grades   is null or e.grade_level = any (v_grades))
      and (v_sections is null or e.section_id  = any (v_sections))
  ),
  pairs as (
    select t.student_id, ft.id as fee_type_id, ft.name,
           coalesce(p_amount, ft.default_amount) as amount
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
           p.name, p.amount, p_due_date, 'active', v_profile
    from pairs p
    where p.amount is not null and p.amount > 0
    on conflict do nothing
    returning 1
  )
  select (select count(*) from inserted)::integer, (select n from counted)
    into v_created, v_targeted;

  perform pta.write_audit(
    p_school_id, 'FEES_ASSESSED', 'student_charge', null, null,
    jsonb_build_object(
      'school_year_id', p_school_year_id,
      'fee_type_ids',   to_jsonb(p_fee_type_ids),
      'scope', case
                 when v_sections is not null then 'sections'
                 when v_grades   is not null then 'grades'
                 else 'all_enrolled'
               end,
      'grade_levels', to_jsonb(v_grades),
      'section_ids',  to_jsonb(v_sections),
      'amount',       p_amount,
      'targeted',     v_targeted,
      'created',      v_created,
      'skipped',      v_targeted - v_created
    )
  );

  created_count := v_created;
  skipped_count := v_targeted - v_created;
  return next;
end;
$$;

revoke execute on function pta.assess_fees_scoped(uuid, uuid, uuid[], text[], uuid[], numeric, date) from public;
grant  execute on function pta.assess_fees_scoped(uuid, uuid, uuid[], text[], uuid[], numeric, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. pta.v_section_charge_summary
--
-- The section is the one the student was in THAT year — charges join to their
-- own year's enrollment, never to wherever the student is now. A student with
-- no section yet groups under a null section_id, labelled in the app.
-- Cancelled charges are excluded; waived amounts are already netted out of
-- `balance` by v_student_charge_balances, and are netted out of `charged` here
-- so that charged = collected + owed.
-- ---------------------------------------------------------------------------

create or replace view pta.v_section_charge_summary
with (security_invoker = true) as
select
  b.school_id,
  b.school_year_id,
  e.grade_level,
  gl.sort_order                                   as grade_sort,
  e.section_id,
  s.name                                          as section_name,
  b.fee_type_id,
  b.fee_type_name,
  b.fee_category,
  count(distinct b.student_id)::integer           as student_count,
  count(distinct b.student_id) filter (where b.balance > 0)::integer
                                                  as unpaid_count,
  sum(b.amount - b.waived_amount)                 as charged,
  sum(b.paid)                                     as collected,
  sum(b.balance)                                  as balance
from pta.v_student_charge_balances b
join pta.student_enrollments e
  on e.student_id = b.student_id
 and e.school_year_id = b.school_year_id
join pta.grade_levels gl on gl.code = e.grade_level
left join pta.sections s on s.id = e.section_id
where b.status <> 'cancelled'
group by b.school_id, b.school_year_id, e.grade_level, gl.sort_order,
         e.section_id, s.name, b.fee_type_id, b.fee_type_name, b.fee_category;

revoke all on pta.v_section_charge_summary from public, anon;
grant select on pta.v_section_charge_summary to authenticated;
