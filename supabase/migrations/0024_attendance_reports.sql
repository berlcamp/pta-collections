-- ===========================================================================
-- 0024_attendance_reports.sql — school attendance summaries
--
-- Backs Reports → Attendance, and the Attendance tab on a student's page. Two
-- read-only functions, no new tables, no new writes.
--
-- Why functions and not views: PostgREST cannot GROUP BY. A month of a
-- 4,000-student school is on the order of a hundred thousand scan rows, and
-- summarising them means either aggregating in SQL or shipping all of them to
-- Node and counting there. The second is both slow and forbidden — bucketing a
-- day in the browser is exactly what D11 rules out, and it is why
-- v_attendance_local exists at all.
--
-- Posture, following 0015 and 0021:
--   * SECURITY INVOKER. A summary is a read, and reads here are RLS-bound like
--     every other one. A definer function would hand a cashier at school B a
--     count of school A's students, computed by the owner, with no policy in
--     the way. There is nothing about aggregation that needs elevating.
--   * Granted to `authenticated` only. NOT to service_role and NOT to anon —
--     the gate board's grants from 0013 are not widened to cover this.
--
-- What "present" means here, and what it does not:
--   A row in pta.attendance is a CARD passing a reader. This file counts a
--   student as present on a day when at least one scan resolved to them that
--   day, which is the same rule /super/attendance applies to the first scan of
--   the morning. It is not a measurement of attendance:
--
--     * A student holding no card can never be present, however often they
--       come to school. attendance_student_summary therefore returns has_card
--       for every enrolled student, so the report can separate "did not come"
--       from "cannot be seen". A denominator that quietly includes the second
--       is a lie the office would act on.
--     * One reader cannot tell an arrival from a departure. Nothing here
--       counts hours, half-days or lateness, because nothing in the data
--       supports it.
--
-- The roster side reads student_enrollments and filters on neither student
-- status nor date: it EXPOSES student_status, the way v_outstanding_dues does
-- (D25). A student who left in October still has an enrolment and still has a
-- September, and hiding them would silently shrink last month's denominator.
--
-- Apply by hand in the SQL Editor, in order, like every other migration here.
-- Never `supabase db push`: the project is shared with construction-saas and
-- sms-demo.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- attendance_day_summary — one row per school day that saw any activity
--
-- Days with no scan at all are absent from the result rather than present with
-- zeroes. The database cannot tell a Sunday, a holiday, a typhoon closure and a
-- dead reader apart, so it does not invent rows it would have to guess the
-- meaning of. The caller counts the rows it gets and calls that the number of
-- days the gate saw anyone — which is what it is.
-- ---------------------------------------------------------------------------

create or replace function pta.attendance_day_summary(
  p_school_id uuid,
  p_from      date,
  p_to        date
)
returns table (
  local_date       date,
  students_present integer,   -- distinct students; unknown cards excluded
  scans            integer,   -- every tap, including repeats by one student
  unknown_scans    integer,   -- taps by plastic no student currently holds
  first_scan_at    timestamptz,
  last_scan_at     timestamptz
)
language sql
stable
security invoker
set search_path = pta, public
as $$
  select
    a.local_date,
    count(distinct a.student_id)::integer,
    count(*)::integer,
    count(*) filter (where a.student_id is null)::integer,
    min(a.scanned_at),
    max(a.scanned_at)
  from pta.v_attendance_local a
  where a.school_id = p_school_id
    -- local_date is the authority (D11). The scanned_at bounds beside it are
    -- only there so attendance_school_time_idx can prune: local_date is a
    -- computed expression and no index covers it, so without this a one-week
    -- report reads every scan the school has ever recorded. A day's padding on
    -- each end covers any timezone offset.
    and a.scanned_at >= (p_from - 1)::timestamptz
    and a.scanned_at <  (p_to + 2)::timestamptz
    and a.local_date between p_from and p_to
  group by a.local_date
  order by a.local_date desc;
$$;

-- ---------------------------------------------------------------------------
-- attendance_student_summary — every enrolled student, seen or not
--
-- Returns the whole roll, including students with zero scans, because the rows
-- worth reading are precisely the empty ones. Filtering them out server-side
-- would leave the page unable to distinguish a student who was never at school
-- from one who is not enrolled.
--
-- days_present is `count(distinct local_date)`, not a count of scans: a child
-- who taps in and out four times was at school once.
-- ---------------------------------------------------------------------------

create or replace function pta.attendance_student_summary(
  p_school_id      uuid,
  p_school_year_id uuid,
  p_from           date,
  p_to             date
)
returns table (
  student_id     uuid,
  full_name      text,
  student_no     text,
  grade_level    text,
  section_name   text,
  student_status text,
  -- False means this student CANNOT appear at the gate. Their zero is a
  -- missing card, not an absence, and the two must never be added together.
  has_card       boolean,
  days_present   integer,
  scans          integer,
  first_seen     date,
  last_seen      date,
  last_scan_at   timestamptz
)
language sql
stable
security invoker
set search_path = pta, public
as $$
  with seen as (
    select
      a.student_id,
      count(*)::integer                     as scans,
      count(distinct a.local_date)::integer as days_present,
      min(a.local_date)                     as first_seen,
      max(a.local_date)                     as last_seen,
      max(a.scanned_at)                     as last_scan_at
    from pta.v_attendance_local a
    where a.school_id = p_school_id
      and a.student_id is not null
      and a.scanned_at >= (p_from - 1)::timestamptz
      and a.scanned_at <  (p_to + 2)::timestamptz
      and a.local_date between p_from and p_to
    group by a.student_id
  ),
  -- Distinct, because a student who lost a card and was reissued one holds two
  -- rows once the first is revoked -- and could hold two live ones if a school
  -- ever issues a spare. Either way the question is only "any live card".
  carded as (
    select distinct c.student_id
    from pta.student_cards c
    where c.school_id = p_school_id
      and c.revoked_at is null
  )
  select
    s.id,
    pta.display_name(s.last_name, s.first_name, s.middle_name, s.suffix),
    coalesce(en.student_number, s.lrn),
    en.grade_level,
    sec.name,
    s.status::text,
    (cd.student_id is not null),
    coalesce(sn.days_present, 0),
    coalesce(sn.scans, 0),
    sn.first_seen,
    sn.last_seen,
    sn.last_scan_at
  from pta.student_enrollments en
  join pta.students s on s.id = en.student_id
  left join pta.sections sec on sec.id = en.section_id
  left join seen   sn on sn.student_id = s.id
  left join carded cd on cd.student_id = s.id
  where en.school_id      = p_school_id
    and en.school_year_id = p_school_year_id
    and en.status = 'enrolled'
  order by en.grade_level, s.last_name, s.first_name;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Same posture as 0015 and 0021: authenticated only, and the gate
-- board's service_role surface is not widened to reach either of these.
-- ---------------------------------------------------------------------------

revoke execute on function
  pta.attendance_day_summary(uuid, date, date) from public;
revoke execute on function
  pta.attendance_student_summary(uuid, uuid, date, date) from public;

grant execute on function
  pta.attendance_day_summary(uuid, date, date) to authenticated;
grant execute on function
  pta.attendance_student_summary(uuid, uuid, date, date) to authenticated;
