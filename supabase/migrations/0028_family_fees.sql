-- 0028_family_fees.sql — fees charged once per family, not once per child.
--
-- A parent with three children pays the PTA contribution once. Until now every
-- fee was charged to every enrolled student, and the only fix was waiving the
-- siblings' charges by hand.
--
-- THE RULES (decided with the school)
--
--   - A FAMILY is every student connected through a shared parent or guardian
--     record — ANY link, primary or not, and transitively: if Ana and Ben share
--     their mother, and Ben and Carlo share a grandmother, all three are one
--     family. This is why 0027 exists: a parent typed in twice splits a family
--     in two, and the family pays twice. Merge duplicates before assessing.
--   - The ELDEST child carries the charge. "Eldest" is the highest grade, then
--     the earliest birth date, then a stable tiebreak. Grade first because it
--     is on every enrollment, whereas birth_date is optional and often blank —
--     ordering by a blank field would pick the child the office happened to
--     type a birthday for.
--   - A student with no parent on file is a family of one, and is charged.
--
-- HOW IT FITS
--
--   fee_types.billing_basis is 'per_student' (everything that exists today,
--   the default) or 'per_family'. assess_fees_scoped() (0026) is redefined:
--   for a per-family fee, its targets are one carrier per family among the
--   students in scope, and a family is SKIPPED if any member already holds a
--   live charge of that fee for that year — so a re-run, or a late-enrolled
--   younger sibling, never charges the family twice. The carrier's charge is
--   an ordinary student_charge: paid at the cashier or in the portal, where
--   the parent sees all their children anyway, and receipted like any other.
--
--   Families are built from students ENROLLED IN THAT YEAR in any status, so a
--   sibling who already paid this year and then transferred out still counts
--   as the family having been charged. Only an 'enrolled' student is ever
--   chosen to carry a new charge.
--
-- pta.student_families() is the one definition of a family. It is SECURITY
-- INVOKER — a read, RLS-bound — so the Assess screen's "412 students in 287
-- families" preview and the assessment itself cannot disagree about who is
-- related to whom.

alter table pta.fee_types
  add column if not exists billing_basis text not null default 'per_student'
    check (billing_basis in ('per_student', 'per_family'));

-- ---------------------------------------------------------------------------
-- pta.student_families(school, year) → (student_id, family_id)
--
-- Connected components over "shares a guardian", by a recursive walk. UNION
-- (not UNION ALL) is what makes it terminate on a cycle. family_id is the
-- smallest student id in the component: arbitrary but stable, which is all an
-- id needs to be.
-- ---------------------------------------------------------------------------

create or replace function pta.student_families(p_school_id uuid, p_school_year_id uuid)
returns table (student_id uuid, family_id uuid)
language sql
stable
security invoker
set search_path = pta, public
as $$
  with recursive
  members as (
    select e.student_id
    from pta.student_enrollments e
    where e.school_id = p_school_id and e.school_year_id = p_school_year_id
  ),
  edges as (
    select distinct a.student_id as s1, b.student_id as s2
    from pta.student_guardians a
    join pta.student_guardians b
      on b.guardian_id = a.guardian_id and b.student_id <> a.student_id
    join members m1 on m1.student_id = a.student_id
    join members m2 on m2.student_id = b.student_id
    where a.school_id = p_school_id
  ),
  reach (root, sid) as (
    select m.student_id, m.student_id from members m
    union
    select r.root, e.s2 from reach r join edges e on e.s1 = r.sid
  )
  select sid, min(root::text)::uuid
  from reach
  group by sid
$$;

revoke execute on function pta.student_families(uuid, uuid) from public, anon;
grant  execute on function pta.student_families(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- pta.assessment_scope_count — the preview: students and families in a scope
-- ---------------------------------------------------------------------------

create or replace function pta.assessment_scope_count(
  p_school_id      uuid,
  p_school_year_id uuid,
  p_grade_levels   text[] default null,
  p_section_ids    uuid[] default null
)
returns table (student_count integer, family_count integer)
language sql
stable
security invoker
set search_path = pta, public
as $$
  select count(*)::integer, count(distinct f.family_id)::integer
  from pta.student_enrollments e
  join pta.student_families(p_school_id, p_school_year_id) f on f.student_id = e.student_id
  where e.school_id = p_school_id
    and e.school_year_id = p_school_year_id
    and e.status = 'enrolled'
    and (nullif(p_grade_levels, '{}') is null or e.grade_level = any (p_grade_levels))
    and (nullif(p_section_ids, '{}')  is null or e.section_id  = any (p_section_ids))
$$;

revoke execute on function pta.assessment_scope_count(uuid, uuid, text[], uuid[]) from public, anon;
grant  execute on function pta.assessment_scope_count(uuid, uuid, text[], uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- assess_fees_scoped, redefined (same signature as 0026, so the app is
-- unchanged). Everything up to the targets is 0026 verbatim.
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
  v_families integer := 0;
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
           coalesce(p_amount, ft.default_amount) as amount
    from pta.fee_types ft
    where ft.id = any (p_fee_type_ids)
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
      'fee_type_ids',   to_jsonb(p_fee_type_ids),
      'scope', case
                 when v_sections is not null then 'sections'
                 when v_grades   is not null then 'grades'
                 else 'all_enrolled'
               end,
      'grade_levels', to_jsonb(v_grades),
      'section_ids',  to_jsonb(v_sections),
      'amount',       p_amount,
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
