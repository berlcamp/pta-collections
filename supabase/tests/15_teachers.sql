-- 15_teachers.sql — migration 0030: teacher accounts and section attendance.
--
-- Reuses 13_family_fees' 2031-2032 year: Grade 7 section "Sampaguita" holds
-- Ben, Eve and Fay. A second section is added so "not your section" can be
-- tested. Scans are written as the owner, as the gate's RPC would.

\set A_ADMIN '''22222222-2222-2222-2222-222222222222'''
\set A_TREAS '''44444444-4444-4444-4444-444444444444'''
\set B_ADMIN '''55555555-5555-5555-5555-555555555555'''
\set TEACH   '''88888888-8888-8888-8888-888888888888'''

insert into auth.users (id, email, raw_user_meta_data)
values (:TEACH, 'teacher.a@example.com', '{"full_name":"Teacher Ozamiz"}');

select id as school_a from pta.schools where school_code = 'ONHS' \gset
select id as fy from pta.school_years where name = '2031-2032' and school_id = :'school_a' \gset
select id as samp from pta.sections where school_year_id = :'fy' and name = 'Sampaguita' \gset

select pta_test.login(:A_ADMIN::uuid);
select pta.invite_school_user(:'school_a', 'teacher.a@example.com', 'Teacher Ozamiz', 'teacher');
insert into pta.sections (school_id, school_year_id, grade_level, name)
values (:'school_a', :'fy', 'Grade 8', 'Narra');
select pta_test.logout();
select id as narra from pta.sections where school_year_id = :'fy' and name = 'Narra' \gset

select pta_test.login(:TEACH::uuid);
select pta.claim_invite();
select pta_test.logout();
select id as teacher_profile from pta.profiles where email = 'teacher.a@example.com' \gset

-- Cards for Ben and Eve (Fay has none), and a morning at the gate.
insert into pta.student_cards (school_id, student_id, card_uid, issued_at)
select :'school_a', s.id, v.uid, '2031-01-01'
from (values ('Ben', 'AA000001'), ('Eve', 'AA000002')) v(fn, uid)
join pta.students s on s.first_name = v.fn and s.last_name = 'Fam' and s.school_id = :'school_a';

insert into pta.attendance (event_id, school_id, device_id, card_uid, scanned_at, clock_synced)
values (gen_random_uuid(), :'school_a', 'onhs-main-gate', 'AA000001', '2031-06-10 07:05+08', true),
       (gen_random_uuid(), :'school_a', 'onhs-main-gate', 'AA000001', '2031-06-10 16:40+08', true),
       (gen_random_uuid(), :'school_a', 'onhs-main-gate', 'AA000002', '2031-06-11 07:12+08', true);

-- ---------------------------------------------------------------------------
-- A teacher membership reads NOTHING of the school through RLS
-- ---------------------------------------------------------------------------
select pta_test.login(:TEACH::uuid);

select pta_test.eq(
  (select role from pta.school_users where profile_id = :'teacher_profile'),
  'teacher',
  'TC1. A teacher can be invited, and sees their own membership');

select pta_test.ok(
  exists (select 1 from pta.schools where id = :'school_a'),
  'TC2. A teacher can read their own school''s row (the session needs it)');

select pta_test.eq((select count(*)::int from pta.students), 0,
  'TC3. A teacher reads no students through RLS');
select pta_test.eq((select count(*)::int from pta.payments), 0,
  'TC4. A teacher reads no payments');
select pta_test.eq((select count(*)::int from pta.parents_guardians), 0,
  'TC5. A teacher reads no parents or their phone numbers');
select pta_test.eq((select count(*)::int from pta.student_charges), 0,
  'TC6. A teacher reads no charges');
select pta_test.eq((select count(*)::int from pta.attendance), 0,
  'TC7. A teacher reads no raw gate scans');

select pta_test.eq((select count(*)::int from pta.teacher_sections()), 0,
  'TC8. An unassigned teacher has no sections');
select pta_test.throws(format($$ select * from pta.section_attendance_day(%L, '2031-06-10') $$, :'samp'),
  'TC9. An unassigned teacher cannot read a section''s attendance');
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- Assignment
-- ---------------------------------------------------------------------------
select pta_test.login(:A_TREAS::uuid);
select pta_test.throws(format($$ insert into pta.section_teachers (section_id, profile_id, school_id) values (%L, %L, %L) $$,
  :'samp', :'teacher_profile', :'school_a'),
  'TC10. Only an admin assigns teachers');
select pta_test.logout();

select pta_test.login(:A_ADMIN::uuid);
select pta_test.throws(format($$ insert into pta.section_teachers (section_id, profile_id, school_id) values (%L, (select id from pta.profiles where email = 'cashier.a@example.com'), %L) $$,
  :'samp', :'school_a'),
  'TC11. Only a profile with a teacher membership can be assigned');
insert into pta.section_teachers (section_id, profile_id, school_id)
values (:'samp', :'teacher_profile', :'school_a');
select pta_test.logout();

select pta_test.login(:B_ADMIN::uuid);
select pta_test.throws(format($$ insert into pta.section_teachers (section_id, profile_id, school_id) values (%L, %L, %L) $$,
  :'narra', :'teacher_profile', :'school_a'),
  'TC12. Another school''s admin cannot assign here');
select pta_test.throws(format($$ select * from pta.section_attendance_day(%L, '2031-06-10') $$, :'samp'),
  'TC13. Another school''s admin cannot read the section');
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- The assigned teacher's reads
-- ---------------------------------------------------------------------------
select pta_test.login(:TEACH::uuid);

select pta_test.eq(
  (select section_name || '/' || enrolled_count from pta.teacher_sections()),
  'Sampaguita/3',
  'TC14. The teacher sees their section and its roll size');

select pta_test.eq(
  (select string_agg(split_part(full_name, ', ', 2) || ':' ||
                     case when first_scan_at is null then '-' else to_char(first_scan_at at time zone 'Asia/Manila', 'HH24:MI') end
                     || ':' || has_card::text, ' ' order by full_name)
     from pta.section_attendance_day(:'samp', '2031-06-10')),
  'Ben:07:05:true Eve:-:true Fay:-:false',
  'TC15. One day: who tapped and when, who did not, and who holds no card');

select pta_test.eq(
  (select scans from pta.section_attendance_day(:'samp', '2031-06-10') where full_name like '%Ben%'),
  2,
  'TC16. A student''s taps that day are counted');

select pta_test.eq(
  (select string_agg(split_part(full_name, ', ', 2) || ':' || days_present || '/' || school_days, ' ' order by full_name)
     from pta.section_attendance_summary(:'samp', '2031-06-01', '2031-06-30')),
  'Ben:1/2 Eve:1/2 Fay:0/2',
  'TC17. A range: days present per student, out of days the gate saw anyone');

select pta_test.throws(format($$ select * from pta.section_attendance_day(%L, '2031-06-10') $$, :'narra'),
  'TC18. A teacher cannot read a section that is not theirs');

select pta_test.logout();

-- An admin may open the teacher screen for any section of their school.
select pta_test.login(:A_ADMIN::uuid);
select pta_test.eq(
  (select count(*)::int from pta.section_attendance_day(:'samp', '2031-06-10')),
  3,
  'TC19. An admin can read a section''s day too');

-- ---------------------------------------------------------------------------
-- Reports → Attendance, filtered
-- ---------------------------------------------------------------------------
select pta_test.eq(
  (select students_present from pta.attendance_day_summary_scoped(:'school_a', :'fy', '2031-06-10', '2031-06-10', null, :'samp')),
  1,
  'TC20. The day summary can be filtered to one section');
select pta_test.eq(
  (select count(*)::int from pta.attendance_day_summary_scoped(:'school_a', :'fy', '2031-06-01', '2031-06-30', 'Grade 8', null)),
  0,
  'TC21. Filtered to a grade with no taps, there are no days');
select pta_test.logout();

-- Deactivating the membership takes the sections away.
select pta_test.login(:A_ADMIN::uuid);
update pta.school_users set status = 'inactive' where profile_id = :'teacher_profile';
select pta_test.logout();
select pta_test.login(:TEACH::uuid);
select pta_test.throws(format($$ select * from pta.section_attendance_day(%L, '2031-06-10') $$, :'samp'),
  'TC22. A deactivated teacher can no longer read their section');
select pta_test.logout();
