-- 16_invite_teacher.sql — migration 0031: sections chosen on the invite.

\set A_ADMIN '''22222222-2222-2222-2222-222222222222'''
\set TEACH2  '''99999999-9999-9999-9999-999999999999'''

insert into auth.users (id, email, raw_user_meta_data)
values (:TEACH2, 'teacher.b@example.com', '{"full_name":"Teacher Two"}');

select id as school_a from pta.schools where school_code = 'ONHS' \gset
select id as fy from pta.school_years where name = '2031-2032' and school_id = :'school_a' \gset
select id as samp from pta.sections where school_year_id = :'fy' and name = 'Sampaguita' \gset
select id as narra from pta.sections where school_year_id = :'fy' and name = 'Narra' \gset
select s.id as b_section from pta.sections s join pta.schools sc on sc.id = s.school_id
 where sc.school_code = 'TNHS' limit 1 \gset

select pta_test.login(:A_ADMIN::uuid);

select pta_test.throws(format($$ select pta.invite_teacher(%L, 'x@example.com', 'X', array[%L]::uuid[]) $$,
  :'school_a', :'b_section'),
  'IT1. A section from another school is refused on the invite');

-- Not yet signed in: the sections wait on the invite.
select pta.invite_teacher(:'school_a', 'teacher.b@example.com', 'Teacher Two',
  array[:'samp', :'narra']::uuid[]);
select pta_test.eq(
  (select array_length(section_ids, 1) from pta.school_user_invites
    where email = 'teacher.b@example.com' and status = 'pending'),
  2,
  'IT2. A pending invite carries its sections');

-- Already holding a profile (Tangub's admin): accepted and assigned at once.
select pta.invite_teacher(:'school_a', 'admin.b@example.com', 'Admin Tangub',
  array[:'narra']::uuid[]);
select pta_test.ok(
  exists (select 1 from pta.section_teachers st join pta.profiles p on p.id = st.profile_id
           where p.email = 'admin.b@example.com' and st.section_id = :'narra'),
  'IT3. Someone who already has an account is assigned immediately');
select pta_test.logout();

-- The new teacher signs in for the first time.
select pta_test.login(:TEACH2::uuid);
select pta.claim_invite();
select pta_test.eq(
  (select string_agg(section_name, ',' order by section_name) from pta.teacher_sections()),
  'Narra,Sampaguita',
  'IT4. On first sign-in, the invited teacher already has their sections');
select pta_test.logout();
