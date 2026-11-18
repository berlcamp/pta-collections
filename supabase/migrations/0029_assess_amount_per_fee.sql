-- 0029_assess_amount_per_fee.sql — an amount for each fee in one assessment.
--
-- 0026 gave assess_fees_scoped() a single p_amount, which could only override
-- ONE fee — so the Assess screen refused "PTA fee + ID + Homeroom" in one run
-- the moment the homeroom fee (no default) was ticked. The screen now puts an
-- amount in each fee's own row, and this takes them together:
--
--   p_items = [{"fee_type_id": "...", "amount": 200.00}, ...]
--
-- amount null or absent means "use the fee's default"; a fee whose default is
-- also empty is refused by name rather than silently skipped, which is what
-- assess_annual_fees() did and why nobody noticed a fee had not gone out.
--
-- A new name rather than a new overload of assess_fees_scoped(): PostgREST
-- resolves an RPC by its argument names, and two functions sharing most of
-- them is an ambiguity waiting for a request that matches both. 0026/0028's
-- function is left as applied history; the app no longer calls it.
--
-- Everything else — scope, sections check, per-family carriers, idempotency,
-- the audit row — is 0028's, unchanged.

create or replace function pta.assess_fees(
  p_school_id      uuid,
  p_school_year_id uuid,
  p_items          jsonb,
  p_grade_levels   text[]  default null,
  p_section_ids    uuid[]  default null,
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
  v_families integer := 0;
  v_profile  uuid := pta.current_profile_id();
  v_grades   text[] := nullif(p_grade_levels, '{}');
  v_sections uuid[] := nullif(p_section_ids, '{}');
  v_fee_type_ids uuid[];
  v_missing  text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Select at least one fee type to assess.';
  end if;

  select array_agg(x.fee_type_id) into v_fee_type_ids
  from jsonb_to_recordset(p_items) as x(fee_type_id uuid, amount numeric);

  if (select count(distinct x) from unnest(v_fee_type_ids) x) <> array_length(v_fee_type_ids, 1) then
    raise exception 'A fee type is listed twice.';
  end if;

  perform pta.require_school_role(p_school_id, array['admin']);

  if v_fee_type_ids is null or array_length(v_fee_type_ids, 1) is null then
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
    select 1 from unnest(v_fee_type_ids) ft_id
    where not exists (
      select 1 from pta.fee_types ft
      where ft.id = ft_id and ft.school_id = p_school_id and ft.active
    )
  ) then
    raise exception 'One or more fee types do not belong to this school or are inactive.'
      using errcode = '42501';
  end if;

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

  if exists (select 1 from jsonb_to_recordset(p_items) as a(fee_type_id uuid, amount numeric) where a.amount is not null
              and (a.amount <= 0 or a.amount > 9999999.99)) then
    raise exception 'Every amount must be greater than zero.';
  end if;

  select string_agg(ft.name, ', ' order by ft.name) into v_missing
  from jsonb_to_recordset(p_items) as a(fee_type_id uuid, amount numeric) join pta.fee_types ft on ft.id = a.fee_type_id
  where coalesce(a.amount, ft.default_amount, 0) <= 0;
  if v_missing is not null then
    raise exception 'Enter an amount for: %', v_missing;
  end if;

  with fam as (
    select * from pta.student_families(p_school_id, p_school_year_id)
  ),
  targets as (
    select e.student_id, f.family_id, gl.sort_order as grade_sort, st.birth_date
    from pta.student_enrollments e
    join pta.students st      on st.id = e.student_id
    join pta.grade_levels gl  on gl.code = e.grade_level
    join fam f                on f.student_id = e.student_id
    where e.school_id = p_school_id
      and e.school_year_id = p_school_year_id
      and e.status = 'enrolled'
      and (v_grades   is null or e.grade_level = any (v_grades))
      and (v_sections is null or e.section_id  = any (v_sections))
  ),
  fees as (
    select ft.id, ft.name, ft.billing_basis,
           coalesce(a.amount, ft.default_amount) as amount
    from jsonb_to_recordset(p_items) as a(fee_type_id uuid, amount numeric)
    join pta.fee_types ft on ft.id = a.fee_type_id
  ),
  -- Per-student fees: every target, as before.
  per_student as (
    select t.student_id, f.id as fee_type_id, f.name, f.amount
    from targets t cross join fees f
    where f.billing_basis = 'per_student'
  ),
  -- Per-family fees: the eldest target of each family that has not already
  -- been charged this fee this year through ANY member.
  carriers as (
    select distinct on (t.family_id, f.id)
           t.student_id, t.family_id, f.id as fee_type_id, f.name, f.amount
    from targets t cross join fees f
    where f.billing_basis = 'per_family'
    order by t.family_id, f.id, t.grade_sort desc, t.birth_date asc nulls last, t.student_id
  ),
  per_family as (
    select c.student_id, c.fee_type_id, c.name, c.amount
    from carriers c
    where not exists (
      select 1
      from fam m
      join pta.student_charges sc
        on sc.student_id = m.student_id
       and sc.school_year_id = p_school_year_id
       and sc.fee_type_id = c.fee_type_id
       and sc.status <> 'cancelled'
      where m.family_id = c.family_id
    )
  ),
  pairs as (
    select * from per_student
    union all
    select * from per_family
  ),
  counted as (
    -- "Targeted" counts what the admin asked for: each student for a
    -- per-student fee, each FAMILY for a per-family one. Skipped is the
    -- difference, so a re-run reads "0 created, N skipped" either way.
    select (select count(*) from per_student)::integer
         + (select count(*) from carriers)::integer as n,
           (select count(*) from carriers)::integer as families
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
  select (select count(*) from inserted)::integer, c.n, c.families
    into v_created, v_targeted, v_families
  from counted c;

  perform pta.write_audit(
    p_school_id, 'FEES_ASSESSED', 'student_charge', null, null,
    jsonb_build_object(
      'school_year_id', p_school_year_id,
      'fee_type_ids',   to_jsonb(v_fee_type_ids),
      'scope', case
                 when v_sections is not null then 'sections'
                 when v_grades   is not null then 'grades'
                 else 'all_enrolled'
               end,
      'grade_levels', to_jsonb(v_grades),
      'section_ids',  to_jsonb(v_sections),
      'items',        p_items,
      'families',     v_families,
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

revoke execute on function pta.assess_fees(uuid, uuid, jsonb, text[], uuid[], date) from public, anon;
grant  execute on function pta.assess_fees(uuid, uuid, jsonb, text[], uuid[], date) to authenticated;
