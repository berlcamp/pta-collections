-- 02_fixtures.sql — two schools with full staff, students, fees.
-- Everything downstream (isolation tests, RPC tests) builds on this.

-- Auth users. In production these arrive via Google OAuth; here we insert them
-- directly into the stubbed auth.users so we can impersonate them.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'berlcamp@gmail.com',   '{"full_name":"Berl Campomanes"}'),
  ('22222222-2222-2222-2222-222222222222', 'admin.a@example.com',  '{"full_name":"Admin Ozamiz"}'),
  ('33333333-3333-3333-3333-333333333333', 'cashier.a@example.com','{"full_name":"Cashier Ozamiz"}'),
  ('44444444-4444-4444-4444-444444444444', 'treas.a@example.com',  '{"full_name":"Treasurer Ozamiz"}'),
  ('55555555-5555-5555-5555-555555555555', 'admin.b@example.com',  '{"full_name":"Admin Tangub"}'),
  ('66666666-6666-6666-6666-666666666666', 'cashier.b@example.com','{"full_name":"Cashier Tangub"}'),
  ('77777777-7777-7777-7777-777777777777', 'nobody@example.com',   '{"full_name":"Uninvited Person"}');

-- The super admin claims the bootstrap profile row created by migration 0011.
select pta_test.login('11111111-1111-1111-1111-111111111111');
select pta.claim_invite();
select pta_test.logout();

-- Super admin provisions both schools.
select pta_test.login('11111111-1111-1111-1111-111111111111');

select pta.create_school('ONHS', 'Ozamiz National High School', 'ONHS',
                         'Ozamiz', 'Ozamiz City', 'Misamis Occidental', 'Region X');
select pta.create_school('TNHS', 'Tangub City National High School', 'TNHS',
                         'Tangub', 'Tangub City', 'Misamis Occidental', 'Region X');

select pta.invite_school_user(
  (select id from pta.schools where school_code = 'ONHS'),
  'admin.a@example.com', 'Admin Ozamiz', 'admin');
select pta.invite_school_user(
  (select id from pta.schools where school_code = 'TNHS'),
  'admin.b@example.com', 'Admin Tangub', 'admin');

select pta_test.logout();

-- Each school admin claims their invite and sets up their school.
select pta_test.login('22222222-2222-2222-2222-222222222222');
select pta.claim_invite();
select pta.invite_school_user(
  (select id from pta.schools where school_code = 'ONHS'),
  'cashier.a@example.com', 'Cashier Ozamiz', 'cashier');
select pta.invite_school_user(
  (select id from pta.schools where school_code = 'ONHS'),
  'treas.a@example.com', 'Treasurer Ozamiz', 'treasurer');
select pta_test.logout();

select pta_test.login('55555555-5555-5555-5555-555555555555');
select pta.claim_invite();
select pta.invite_school_user(
  (select id from pta.schools where school_code = 'TNHS'),
  'cashier.b@example.com', 'Cashier Tangub', 'cashier');
select pta_test.logout();

select pta_test.login('33333333-3333-3333-3333-333333333333');
select pta.claim_invite();
select pta_test.logout();
select pta_test.login('44444444-4444-4444-4444-444444444444');
select pta.claim_invite();
select pta_test.logout();
select pta_test.login('66666666-6666-6666-6666-666666666666');
select pta.claim_invite();
select pta_test.logout();

-- The uninvited user signs in. This MUST leave no profile behind.
select pta_test.login('77777777-7777-7777-7777-777777777777');
select pta.claim_invite();
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- School A content, created as School A's admin.
-- ---------------------------------------------------------------------------
select pta_test.login('22222222-2222-2222-2222-222222222222');

insert into pta.school_years (school_id, name, start_date, end_date, is_active, created_by)
select id, '2026-2027', '2026-06-01', '2027-03-31', true, pta.current_profile_id()
from pta.schools where school_code = 'ONHS';

insert into pta.sections (school_id, school_year_id, grade_level, name, created_by)
select s.id, sy.id, 'Grade 7', 'Section A', pta.current_profile_id()
from pta.schools s join pta.school_years sy on sy.school_id = s.id
where s.school_code = 'ONHS';

insert into pta.fee_types (school_id, name, category, default_amount, is_recurring, created_by)
select s.id, v.name, v.category, v.amount, v.recurring, pta.current_profile_id()
from pta.schools s,
     (values ('PTA Annual Membership', 'annual', 100.00, true),
             ('Mortuary Assistance',   'annual',  50.00, true),
             ('Lost ID',               'penalty', 100.00, false)) as v(name, category, amount, recurring)
where s.school_code = 'ONHS';

-- Three students in School A.
insert into pta.students (school_id, lrn, first_name, middle_name, last_name, sex, created_by)
select s.id, v.lrn, v.fn, v.mn, v.ln, v.sex, pta.current_profile_id()
from pta.schools s,
     (values ('123456789012', 'Juan',  'Dela', 'Cruz',   'M'),
             ('123456789013', 'Pedro', 'Santos', 'Reyes','M'),
             ('123456789014', 'Maria', 'Luz',  'Bautista','F')) as v(lrn, fn, mn, ln, sex)
where s.school_code = 'ONHS';

insert into pta.student_enrollments
  (school_id, student_id, school_year_id, section_id, grade_level, student_number, created_by)
select st.school_id, st.id, sy.id, sec.id, 'Grade 7',
       '2026-' || lpad((row_number() over (order by st.last_name))::text, 3, '0'),
       pta.current_profile_id()
from pta.students st
join pta.schools s      on s.id = st.school_id
join pta.school_years sy on sy.school_id = s.id
join pta.sections sec    on sec.school_year_id = sy.id
where s.school_code = 'ONHS';

select pta_test.logout();

-- ---------------------------------------------------------------------------
-- School B content, created as School B's admin.
-- ---------------------------------------------------------------------------
select pta_test.login('55555555-5555-5555-5555-555555555555');

insert into pta.school_years (school_id, name, start_date, end_date, is_active, created_by)
select id, '2026-2027', '2026-06-01', '2027-03-31', true, pta.current_profile_id()
from pta.schools where school_code = 'TNHS';

insert into pta.sections (school_id, school_year_id, grade_level, name, created_by)
select s.id, sy.id, 'Grade 8', 'Rizal', pta.current_profile_id()
from pta.schools s join pta.school_years sy on sy.school_id = s.id
where s.school_code = 'TNHS';

insert into pta.fee_types (school_id, name, category, default_amount, created_by)
select s.id, 'PTA Annual Membership', 'annual', 150.00, pta.current_profile_id()
from pta.schools s where s.school_code = 'TNHS';

-- Same LRN as a School A student: a legitimate transfer case. D8 says this must
-- be allowed, because uniqueness is per-school and never global.
insert into pta.students (school_id, lrn, first_name, last_name, sex, created_by)
select s.id, '123456789012', 'Juan', 'Dela Cruz', 'M', pta.current_profile_id()
from pta.schools s where s.school_code = 'TNHS';

insert into pta.student_enrollments
  (school_id, student_id, school_year_id, section_id, grade_level, student_number, created_by)
select st.school_id, st.id, sy.id, sec.id, 'Grade 8', 'TNHS-001', pta.current_profile_id()
from pta.students st
join pta.schools s       on s.id = st.school_id
join pta.school_years sy on sy.school_id = s.id
join pta.sections sec    on sec.school_year_id = sy.id
where s.school_code = 'TNHS';

select pta_test.logout();
