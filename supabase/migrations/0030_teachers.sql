-- 0030_teachers.sql — teacher accounts that see their own sections' attendance.
--
-- A homeroom adviser signs in and sees who tapped in through the gate today,
-- and how their section has attended over a term — for the sections an admin
-- assigned them, and NOTHING else in the school.
--
-- WHY A TEACHER IS NOT A NORMAL MEMBER
--
-- Every staff read here is RLS-bound by pta.current_school_ids(): any active
-- membership in a school lets you read that school's students, guardians,
-- charges, payments, donations and audit log (47 policies). The anon key is
-- public, so whatever a role can read through RLS, a teacher could read with
-- their own JWT straight from the API, bypassing every screen. Giving a teacher
-- an ordinary membership would hand every adviser the fee ledger and every
-- parent's phone number.
--
-- So 'teacher' is a role that current_school_ids() deliberately LEAVES OUT. A
-- teacher's tenant read surface through RLS is empty, and they read only
-- through the SECURITY DEFINER functions below, each of which checks the
-- section is theirs. This is the portal's pattern (0016) — identity compiled
-- into the function, not granted by a policy — for the same reason.
--
-- Two things they still need, and get explicitly:
--   - their own membership row (school_users_read already allows
--     profile_id = current_profile_id()), and
--   - their school's row, so the session can resolve an active school — via
--     pta.member_school_ids() in the schools read policy. A school row carries
--     a name and settings, nothing about any person.
--
-- has_school_role() is unchanged: a teacher passes it only when 'teacher' is
-- in the list, which no existing policy or RPC asks for.
--
-- ASSIGNMENT
--
-- pta.section_teachers links a teacher's profile to a section. Sections are
-- per school year (unique by year, grade, name), so an assignment is too, and
-- a new year starts unassigned — like it starts unsectioned (0021). A section
-- may have several teachers and a teacher several sections. Only an admin
-- writes it, and only for a profile holding an active TEACHER membership in
-- that school.
--
-- READS
--
-- The functions return the same facts the attendance report does (0024): a
-- student is present on a day a card resolving to them passed a reader, day
-- boundaries are the school's (D11), a student with no card is has_card=false
-- and never counted absent, and "school days" is days the gate saw anyone.
-- An admin of the school may call them too, so the teacher screen can be
-- checked without a teacher account.
--
-- Also here: pta.attendance_day_summary_scoped(), so Reports → Attendance can
-- be filtered to a grade or a section.

-- ---------------------------------------------------------------------------
-- 1. The role
-- ---------------------------------------------------------------------------

alter table pta.school_users drop constraint school_users_role_check;
alter table pta.school_users add constraint school_users_role_check
  check (role in ('admin', 'cashier', 'treasurer', 'viewer', 'teacher'));

alter table pta.school_user_invites drop constraint school_user_invites_role_check;
alter table pta.school_user_invites add constraint school_user_invites_role_check
  check (role in ('admin', 'cashier', 'treasurer', 'viewer', 'teacher'));

-- invite_school_user() checks the role list itself, before the constraint
-- would. Redefined from 0010 with 'teacher' added; nothing else changes.
create or replace function pta.invite_school_user(
  p_school_id uuid,
  p_email     text,
  p_full_name text,
  p_role      text
)
returns uuid
language plpgsql
security definer
set search_path = pta, public
as $$
declare
  v_id    uuid;
  v_email text := lower(trim(p_email));
begin
  -- Only a super admin may mint school administrators; a school admin may invite
  -- the operational roles inside their own school.
  if p_role = 'admin' then
    if not pta.is_super_admin() and not pta.has_school_role(p_school_id, array['admin']) then
      raise exception 'Not authorized to invite an administrator.' using errcode = '42501';
    end if;
  else
    perform pta.require_school_role(p_school_id, array['admin']);
  end if;

  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Invalid email address: %', p_email;
  end if;
  if p_role not in ('admin', 'cashier', 'treasurer', 'viewer', 'teacher') then
    raise exception 'Invalid role: %', p_role;
  end if;

  -- Supersede any previous pending invite for this address at this school.
  update pta.school_user_invites
     set status = 'revoked'
   where school_id = p_school_id and email = v_email and status = 'pending';

  insert into pta.school_user_invites (school_id, email, full_name, role, invited_by)
  values (p_school_id, v_email, trim(p_full_name), p_role, pta.current_profile_id())
  returning id into v_id;

  -- If they already have a profile (common on this shared project), apply the
  -- membership immediately rather than making them sign out and back in.
  declare
    v_existing uuid;
  begin
    select id into v_existing from pta.profiles where email = v_email;
    if found then
      insert into pta.school_users (school_id, profile_id, role, status, created_by)
      values (p_school_id, v_existing, p_role, 'active', pta.current_profile_id())
      on conflict (school_id, profile_id) do update
        set role = excluded.role, status = 'active';
      update pta.school_user_invites set status = 'accepted' where id = v_id;
    end if;
  end;

  perform pta.write_audit(p_school_id, 'USER_INVITED', 'school_user_invite', v_id, null,
                          jsonb_build_object('email', v_email, 'role', p_role));
  return v_id;
end;
$$;

-- Every school the caller may READ through RLS. A teacher membership is not
-- one of them — see the header.
create or replace function pta.current_school_ids()
returns uuid[]
language sql
stable
security definer
set search_path = pta, public
as $$
  select coalesce(
    case
      when pta.is_super_admin() then
        (select array_agg(s.id) from pta.schools s where s.active)
      else
        (select array_agg(su.school_id)
         from pta.school_users su
         join pta.schools s on s.id = su.school_id
         where su.profile_id = pta.current_profile_id()
           and su.status = 'active'
           and su.role <> 'teacher'
           and s.active)
    end,
    '{}'::uuid[]
  );
$$;

-- Every school the caller belongs to in ANY role — used only to let a member
-- read their own school's row.
create or replace function pta.member_school_ids()
returns uuid[]
language sql
stable
security definer
set search_path = pta, public
as $$
  select coalesce(
    (select array_agg(su.school_id)
     from pta.school_users su
     where su.profile_id = pta.current_profile_id()
       and su.status = 'active'),
    '{}'::uuid[]
  );
$$;

revoke execute on function pta.member_school_ids() from public, anon;
grant  execute on function pta.member_school_ids() to authenticated;

drop policy if exists schools_read on pta.schools;
create policy schools_read on pta.schools for select to authenticated
using (
  id = any (pta.current_school_ids())
  or id = any (pta.member_school_ids())
  or pta.is_super_admin()
);

-- ---------------------------------------------------------------------------
-- 2. Assignment
-- ---------------------------------------------------------------------------

create table pta.section_teachers (
  section_id  uuid not null references pta.sections(id) on delete cascade,
  profile_id  uuid not null references pta.profiles(id) on delete cascade,
  school_id   uuid not null references pta.schools(id) on delete cascade,
  created_by  uuid references pta.profiles(id) default pta.current_profile_id(),
  created_at  timestamptz not null default now(),
  primary key (section_id, profile_id)
);

create index section_teachers_profile_idx on pta.section_teachers (profile_id);

alter table pta.section_teachers enable row level security;

create policy section_teachers_read on pta.section_teachers for select to authenticated
using (
  school_id = any (pta.current_school_ids())
  or profile_id = pta.current_profile_id()
);

create policy section_teachers_admin_write on pta.section_teachers for all to authenticated
using (pta.has_school_role(school_id, array['admin']))
with check (
  pta.has_school_role(school_id, array['admin'])
  and exists (
    select 1 from pta.sections s
    where s.id = section_teachers.section_id and s.school_id = section_teachers.school_id
  )
  and exists (
    select 1 from pta.school_users su
    where su.school_id = section_teachers.school_id
      and su.profile_id = section_teachers.profile_id
      and su.role = 'teacher'
      and su.status = 'active'
  )
);

revoke all on pta.section_teachers from public, anon;
grant select, insert, delete on pta.section_teachers to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Teacher reads
-- ---------------------------------------------------------------------------

-- The gate for every per-section read: the section's school, if the caller is
-- an active teacher assigned to it or an admin of its school. Raises otherwise.
create or replace function pta.require_section_access(p_section_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = pta, public
as $$
declare
  v_school uuid;
begin
  select s.school_id into v_school from pta.sections s where s.id = p_section_id;
  if v_school is null then
    raise exception 'No such section.' using errcode = '42501';
  end if;

  if pta.has_school_role(v_school, array['admin']) then
    return v_school;
  end if;

  if exists (
    select 1
    from pta.section_teachers st
    join pta.school_users su
      on su.school_id = st.school_id and su.profile_id = st.profile_id
    join pta.schools sc on sc.id = st.school_id
    where st.section_id = p_section_id
      and st.profile_id = pta.current_profile_id()
      and su.role = 'teacher'
      and su.status = 'active'
      and sc.active
  ) then
    return v_school;
  end if;

  raise exception 'Not authorized: that section is not assigned to you.'
    using errcode = '42501';
end;
$$;

revoke execute on function pta.require_section_access(uuid) from public, anon, authenticated;

-- The caller's sections, newest school year first.
create or replace function pta.teacher_sections()
returns table (
  section_id       uuid,
  section_name     text,
  grade_level      text,
  grade_sort       integer,
  school_id        uuid,
  school_year_id   uuid,
  school_year_name text,
  is_active_year   boolean,
  enrolled_count   integer
)
language sql
stable
security definer
set search_path = pta, public
as $$
  select
    s.id, s.name, s.grade_level, gl.sort_order, s.school_id,
    sy.id, sy.name, sy.is_active,
    (select count(*)::integer from pta.student_enrollments e
      where e.section_id = s.id and e.status = 'enrolled')
  from pta.section_teachers st
  join pta.sections s      on s.id = st.section_id
  join pta.school_years sy on sy.id = s.school_year_id
  join pta.grade_levels gl on gl.code = s.grade_level
  join pta.school_users su
    on su.school_id = st.school_id and su.profile_id = st.profile_id
  join pta.schools sc on sc.id = st.school_id
  where st.profile_id = pta.current_profile_id()
    and su.role = 'teacher' and su.status = 'active' and sc.active
  order by sy.is_active desc, sy.start_date desc, gl.sort_order, s.name;
$$;

-- One day at the gate for one section: every enrolled student, with their
-- first and last tap that day (null = not seen).
create or replace function pta.section_attendance_day(p_section_id uuid, p_date date)
returns table (
  student_id    uuid,
  full_name     text,
  student_no    text,
  sex           text,
  has_card      boolean,
  first_scan_at timestamptz,
  last_scan_at  timestamptz,
  scans         integer
)
language plpgsql
stable
security definer
set search_path = pta, public
as $$
declare
  v_school uuid := pta.require_section_access(p_section_id);
begin
  return query
  with roll as (
    select e.student_id, e.student_number
    from pta.student_enrollments e
    where e.section_id = p_section_id and e.status = 'enrolled'
  ),
  seen as (
    select a.student_id, min(a.scanned_at) as first_at, max(a.scanned_at) as last_at,
           count(*)::integer as n
    from pta.v_attendance_local a
    where a.school_id = v_school
      and a.student_id in (select r.student_id from roll r)
      and a.scanned_at >= (p_date - 1)::timestamptz
      and a.scanned_at <  (p_date + 2)::timestamptz
      and a.local_date = p_date
    group by a.student_id
  )
  select
    st.id,
    pta.display_name(st.last_name, st.first_name, st.middle_name, st.suffix),
    coalesce(r.student_number, st.lrn),
    st.sex::text,
    exists (select 1 from pta.student_cards c
             where c.student_id = st.id and c.revoked_at is null),
    sn.first_at, sn.last_at, coalesce(sn.n, 0)
  from roll r
  join pta.students st on st.id = r.student_id
  left join seen sn on sn.student_id = st.id
  order by st.last_name, st.first_name;
end;
$$;

-- A date range for one section: days present per student, and the number of
-- days the gate saw anyone in the school (the only "school days" there is).
create or replace function pta.section_attendance_summary(
  p_section_id uuid,
  p_from       date,
  p_to         date
)
returns table (
  student_id   uuid,
  full_name    text,
  student_no   text,
  has_card     boolean,
  days_present integer,
  scans        integer,
  last_seen    date,
  school_days  integer
)
language plpgsql
stable
security definer
set search_path = pta, public
as $$
declare
  v_school uuid := pta.require_section_access(p_section_id);
  v_days   integer;
begin
  select count(distinct a.local_date)::integer into v_days
  from pta.v_attendance_local a
  where a.school_id = v_school
    and a.scanned_at >= (p_from - 1)::timestamptz
    and a.scanned_at <  (p_to + 2)::timestamptz
    and a.local_date between p_from and p_to;

  return query
  with roll as (
    select e.student_id, e.student_number
    from pta.student_enrollments e
    where e.section_id = p_section_id and e.status = 'enrolled'
  ),
  seen as (
    select a.student_id,
           count(distinct a.local_date)::integer as days,
           count(*)::integer as n,
           max(a.local_date) as last_day
    from pta.v_attendance_local a
    where a.school_id = v_school
      and a.student_id in (select r.student_id from roll r)
      and a.scanned_at >= (p_from - 1)::timestamptz
      and a.scanned_at <  (p_to + 2)::timestamptz
      and a.local_date between p_from and p_to
    group by a.student_id
  )
  select
    st.id,
    pta.display_name(st.last_name, st.first_name, st.middle_name, st.suffix),
    coalesce(r.student_number, st.lrn),
    exists (select 1 from pta.student_cards c
             where c.student_id = st.id and c.revoked_at is null),
    coalesce(sn.days, 0), coalesce(sn.n, 0), sn.last_day, v_days
  from roll r
  join pta.students st on st.id = r.student_id
  left join seen sn on sn.student_id = st.id
  order by st.last_name, st.first_name;
end;
$$;

revoke execute on function pta.teacher_sections()                              from public, anon;
revoke execute on function pta.section_attendance_day(uuid, date)              from public, anon;
revoke execute on function pta.section_attendance_summary(uuid, date, date)    from public, anon;
grant  execute on function pta.teacher_sections()                              to authenticated;
grant  execute on function pta.section_attendance_day(uuid, date)              to authenticated;
grant  execute on function pta.section_attendance_summary(uuid, date, date)    to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Reports → Attendance, filtered to a grade or a section
--
-- 0024's attendance_day_summary() counted the whole school. This counts only
-- students enrolled in the chosen grade/section that year. Unknown cards
-- belong to no grade, so unknown_scans is reported only unfiltered.
-- SECURITY INVOKER, like 0024: a read, so RLS decides.
-- ---------------------------------------------------------------------------

create or replace function pta.attendance_day_summary_scoped(
  p_school_id      uuid,
  p_school_year_id uuid,
  p_from           date,
  p_to             date,
  p_grade_level    text default null,
  p_section_id     uuid default null
)
returns table (
  local_date       date,
  students_present integer,
  scans            integer,
  unknown_scans    integer,
  first_scan_at    timestamptz,
  last_scan_at     timestamptz
)
language sql
stable
security invoker
set search_path = pta, public
as $$
  with scope as (
    select e.student_id
    from pta.student_enrollments e
    where e.school_id = p_school_id
      and e.school_year_id = p_school_year_id
      and (p_grade_level is null or e.grade_level = p_grade_level)
      and (p_section_id  is null or e.section_id  = p_section_id)
  )
  select
    a.local_date,
    count(distinct a.student_id)::integer,
    count(*)::integer,
    case when p_grade_level is null and p_section_id is null
         then count(*) filter (where a.student_id is null)::integer
         else 0 end,
    min(a.scanned_at),
    max(a.scanned_at)
  from pta.v_attendance_local a
  where a.school_id = p_school_id
    and a.scanned_at >= (p_from - 1)::timestamptz
    and a.scanned_at <  (p_to + 2)::timestamptz
    and a.local_date between p_from and p_to
    and (
      (p_grade_level is null and p_section_id is null)
      or a.student_id in (select s.student_id from scope s)
    )
  group by a.local_date
  order by a.local_date desc;
$$;

revoke execute on function pta.attendance_day_summary_scoped(uuid, uuid, date, date, text, uuid) from public, anon;
grant  execute on function pta.attendance_day_summary_scoped(uuid, uuid, date, date, text, uuid) to authenticated;
