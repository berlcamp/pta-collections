-- 0021_student_promotion.sql
-- Rolling a school's roll forward into the next school year.
--
-- Creating a school year has always been inert: it inserts a `school_years`
-- row and nothing else. Enrollment is per (student, year), so a new year opens
-- with zero of them — the roll reads empty, the gate roster is empty, the
-- portal shows parents no children, and no payment can be recorded at all
-- (pta.payments has an FK to student_enrollments). Until now the only way to
-- populate a new year in bulk was to re-import the whole roll as a CSV with
-- the grade levels bumped by hand.
--
-- Two functions, deliberately split:
--
--   pta.promotion_plan()     SECURITY INVOKER, stable. A read, so RLS scopes
--                            it like every other read here. This is what the
--                            preview screen shows.
--   pta.promote_students()   SECURITY DEFINER. The write, in ONE transaction.
--
-- They share the same CTE shape on purpose. A preview that can disagree with
-- the commit it is previewing is worse than no preview, and 4,000 students is
-- far past what "recoverable by re-editing" covers — which is the reason this
-- is an RPC at all, when `createStudent` writes students through the RLS-bound
-- client. A half-promoted school is not recoverable by hand.
--
-- Three things this deliberately does NOT do:
--
--   * It does not carry the section over. A section belongs to one grade AND
--     one school year (`unique (school_id, school_year_id, grade_level, name)`),
--     so the target year's sections are different rows entirely — and a
--     Grade 7 "Rizal" does not imply a Grade 8 "Rizal". Promoted students land
--     with no section and the office assigns them.
--   * It does not assess fees. Promotion moves students; charging them is a
--     separate, deliberate act from /charges/assess.
--   * It does not touch a single charge, payment or balance. A graduating
--     student KEEPS their outstanding dues (D25) — see the note on
--     v_outstanding_dues below.
--
-- Idempotent by construction: the insert leans on
-- `unique (student_id, school_year_id)` with `on conflict do nothing`, so a
-- re-run promotes only whoever was missed. Running it twice is a no-op, not a
-- double promotion.

-- ---------------------------------------------------------------------------
-- pta.default_exit_grade
--
-- The grade that graduates when the caller does not name one. The HIGHEST
-- grade the source year taught, never a hardcoded 'Grade 12': plenty of
-- schools here run Kinder-6 or 7-10, and guessing 12 for them would graduate
-- nobody while silently promoting their exit cohort into a grade the school
-- does not teach.
--
-- Deliberately blind to enrollment status. Reading only `status = 'enrolled'`
-- looks more careful and is catastrophically wrong: promote_students marks the
-- exit cohort's enrollments 'graduated', so on a SECOND run that cohort would
-- no longer count, the grade below would become the highest still enrolled,
-- and re-running would graduate it too — walking a whole school out of the
-- door one grade per click. The exit grade is a property of the year's ladder,
-- not of who is left standing on it.
-- ---------------------------------------------------------------------------

create or replace function pta.default_exit_grade(
  p_school_id    uuid,
  p_school_year_id uuid
)
returns text
language sql
stable
security invoker
set search_path = pta, public
as $$
  select e.grade_level
  from pta.student_enrollments e
  join pta.grade_levels g on g.code = e.grade_level
  where e.school_id = p_school_id
    and e.school_year_id = p_school_year_id
  order by g.sort_order desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- pta.promotion_plan — what promote_students WOULD do, one row per grade.
-- ---------------------------------------------------------------------------

create or replace function pta.promotion_plan(
  p_school_id    uuid,
  p_from_year_id uuid,
  p_to_year_id   uuid,
  p_exit_grade   text default null
)
returns table (
  from_grade       text,
  from_sort        integer,
  to_grade         text,      -- null when this grade graduates
  eligible         integer,   -- enrolled in the source year, student still active
  already_enrolled integer,   -- already has a row in the target year
  to_promote       integer,   -- what the commit would actually insert
  with_balance     integer    -- of the eligible, how many still owe on the source year
)
language plpgsql
stable
security invoker
set search_path = pta, public
as $$
declare
  v_exit text := coalesce(
    p_exit_grade,
    pta.default_exit_grade(p_school_id, p_from_year_id)
  );
begin
  return query
  with progression as (
    -- The whole progression rule: one step up pta.grade_levels.sort_order.
    select g.code, g.sort_order,
           lead(g.code) over (order by g.sort_order) as next_code
    from pta.grade_levels g
  ),
  src as (
    select e.student_id, e.grade_level
    from pta.student_enrollments e
    join pta.students st on st.id = e.student_id
    where e.school_id = p_school_id
      and e.school_year_id = p_from_year_id
      and e.status = 'enrolled'
      and st.status = 'active'
  ),
  mapped as (
    select s.student_id,
           s.grade_level,
           pr.sort_order,
           -- Graduating: the named exit grade, or a grade with nowhere above
           -- it to go.
           case when s.grade_level = v_exit then null else pr.next_code end
             as next_code
    from src s
    join progression pr on pr.code = s.grade_level
  ),
  flagged as (
    select m.*,
           exists (
             select 1 from pta.student_enrollments t
             where t.student_id = m.student_id
               and t.school_year_id = p_to_year_id
           ) as carried,
           coalesce((
             select ps.outstanding > 0
             from pta.v_student_payment_status ps
             where ps.student_id = m.student_id
               and ps.school_year_id = p_from_year_id
           ), false) as owes
    from mapped m
  )
  select f.grade_level,
         f.sort_order::integer,
         f.next_code,
         count(*)::integer,
         count(*) filter (where f.carried)::integer,
         count(*) filter (where f.next_code is not null and not f.carried)::integer,
         count(*) filter (where f.owes)::integer
  from flagged f
  group by f.grade_level, f.sort_order, f.next_code
  order by f.sort_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- pta.promote_students — the commit.
-- ---------------------------------------------------------------------------

create or replace function pta.promote_students(
  p_school_id    uuid,
  p_from_year_id uuid,
  p_to_year_id   uuid,
  p_exit_grade   text default null
)
returns table (
  promoted_count  integer,
  graduated_count integer,
  skipped_count   integer
)
language plpgsql
security definer
-- pg_temp LAST, not implicitly first: inside a SECURITY DEFINER function a
-- caller-created temp table would otherwise shadow a pta table of the same
-- name. Every reference below is schema-qualified for the same reason.
set search_path = pta, public, pg_temp
as $$
declare
  v_profile uuid := pta.current_profile_id();
  v_from    pta.school_years;
  v_to      pta.school_years;
  v_exit    text;
begin
  perform pta.require_school_role(p_school_id, array['admin']);

  select * into v_from from pta.school_years
   where id = p_from_year_id and school_id = p_school_id;
  if not found then
    raise exception 'The source school year does not belong to this school.'
      using errcode = '42501';
  end if;

  select * into v_to from pta.school_years
   where id = p_to_year_id and school_id = p_school_id;
  if not found then
    raise exception 'The target school year does not belong to this school.'
      using errcode = '42501';
  end if;

  if p_from_year_id = p_to_year_id then
    raise exception 'Promote into a different school year than the one being promoted from.';
  end if;

  -- Promoting backwards would bump everyone a grade into a year that already
  -- closed, and the graduation half is not undoable by re-running.
  if v_to.start_date <= v_from.start_date then
    raise exception 'The target school year (%) must start after the source year (%).',
      v_to.name, v_from.name;
  end if;

  if p_exit_grade is not null
     and not exists (select 1 from pta.grade_levels where code = p_exit_grade) then
    raise exception 'Unknown grade level: %', p_exit_grade;
  end if;

  v_exit := coalesce(p_exit_grade, pta.default_exit_grade(p_school_id, p_from_year_id));

  -- `on commit drop` ties this to the caller's transaction, which PostgREST
  -- opens per request. The guard covers the one case that outlives it: two
  -- calls inside a single explicit transaction.
  drop table if exists pg_temp.promotion_batch;
  create temporary table promotion_batch on commit drop as
  with progression as (
    select g.code, g.sort_order,
           lead(g.code) over (order by g.sort_order) as next_code
    from pta.grade_levels g
  ),
  src as (
    select e.student_id, e.grade_level, e.student_number
    from pta.student_enrollments e
    join pta.students st on st.id = e.student_id
    where e.school_id = p_school_id
      and e.school_year_id = p_from_year_id
      and e.status = 'enrolled'
      and st.status = 'active'
  )
  select s.student_id,
         s.grade_level,
         s.student_number,
         case when s.grade_level = v_exit then null else pr.next_code end
           as next_code
  from src s
  join progression pr on pr.code = s.grade_level;

  -- Counted BEFORE the insert. Afterwards every promoted student has a target
  -- enrollment by definition, and this would report the whole batch as
  -- "already there".
  select count(*)::integer into skipped_count
  from pg_temp.promotion_batch b
  where b.next_code is not null
    and exists (
      select 1 from pta.student_enrollments t
      where t.student_id = b.student_id and t.school_year_id = p_to_year_id
    );

  with inserted as (
    insert into pta.student_enrollments (
      school_id, student_id, school_year_id, section_id,
      grade_level, student_number, status, created_by
    )
    select p_school_id, b.student_id, p_to_year_id,
           -- Sections belong to one year; the office assigns them afterwards.
           null,
           b.next_code,
           -- Student numbers are unique per (school, year). Carried forward
           -- only when the target year has not already handed it to someone
           -- else — otherwise the row would fail on
           -- student_enrollments_number_idx, which `on conflict` below does
           -- not cover, and take the whole promotion down with it.
           case
             when b.student_number is null then null
             when exists (
               select 1 from pta.student_enrollments t
               where t.school_id = p_school_id
                 and t.school_year_id = p_to_year_id
                 and t.student_number = b.student_number
             ) then null
             else b.student_number
           end,
           'enrolled', v_profile
    from pg_temp.promotion_batch b
    where b.next_code is not null
    on conflict (student_id, school_year_id) do nothing
    returning 1
  )
  select count(*)::integer into promoted_count from inserted;

  -- Graduation is two writes, and both are the truth: the student has left the
  -- school, and the enrollment that ended is the one that ended in graduation.
  --
  -- D25 still holds — a graduate KEEPS their outstanding charges.
  -- v_outstanding_dues filters on neither status, it exposes student_status so
  -- the report can choose. /charges/outstanding defaults to active students,
  -- so a graduate's unpaid dues move behind its "include inactive" toggle,
  -- which already counts them. They are not written off, and this function
  -- never touches a charge.
  with graduated as (
    update pta.students st
       set status = 'graduated'
     where st.school_id = p_school_id
       and st.status = 'active'
       and st.id in (select b.student_id from pg_temp.promotion_batch b where b.next_code is null)
    returning 1
  )
  select count(*)::integer into graduated_count from graduated;

  update pta.student_enrollments e
     set status = 'graduated'
   where e.school_id = p_school_id
     and e.school_year_id = p_from_year_id
     and e.status = 'enrolled'
     and e.student_id in (select b.student_id from pg_temp.promotion_batch b where b.next_code is null);

  perform pta.write_audit(
    p_school_id, 'STUDENTS_PROMOTED', 'school_year', p_to_year_id,
    jsonb_build_object('from_school_year_id', p_from_year_id, 'from_name', v_from.name),
    jsonb_build_object(
      'to_name',         v_to.name,
      'exit_grade',      v_exit,
      'promoted_count',  promoted_count,
      'graduated_count', graduated_count,
      'skipped_count',   skipped_count
    )
  );

  return next;
end;
$$;

-- Same posture as 0015: the gate board's service_role grants are not widened
-- to cover any of this, and anon holds nothing here.
revoke execute on function pta.default_exit_grade(uuid, uuid) from public;
revoke execute on function pta.promotion_plan(uuid, uuid, uuid, text) from public;
revoke execute on function pta.promote_students(uuid, uuid, uuid, text) from public;

grant execute on function pta.default_exit_grade(uuid, uuid) to authenticated;
grant execute on function pta.promotion_plan(uuid, uuid, uuid, text) to authenticated;
grant execute on function pta.promote_students(uuid, uuid, uuid, text) to authenticated;
