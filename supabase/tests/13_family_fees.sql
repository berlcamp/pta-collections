-- 13_family_fees.sql — migration 0028: one charge per family, on the eldest.
--
-- Its own school year and students in School A, set up as the owner.
--
--   Family 1: Ana (Gr 9) and Ben (Gr 7) share a mother; Ben and Carlo (Gr 8)
--             share a grandmother — so all three are ONE family, transitively.
--   Family 2: Dan (Gr 8), no parent on file — a family of one.
--   Family 3: Eve and Fay, both Gr 7, share a father; Fay was born first.

\set A_ADMIN '''22222222-2222-2222-2222-222222222222'''

select id as school_a from pta.schools where school_code = 'ONHS' \gset

insert into pta.school_years (school_id, name, start_date, end_date, is_active)
values (:'school_a', '2031-2032', '2031-06-01', '2032-03-31', false);
select id as fy from pta.school_years where name = '2031-2032' and school_id = :'school_a' \gset

insert into pta.sections (school_id, school_year_id, grade_level, name)
values (:'school_a', :'fy', 'Grade 7', 'Sampaguita');
select id as g7sec from pta.sections where school_year_id = :'fy' \gset

insert into pta.students (school_id, lrn, first_name, last_name, sex, birth_date)
select :'school_a', v.lrn, v.fn, 'Fam', 'F', v.bd::date
from (values ('920000000001', 'Ana',   '2017-01-01'),
             ('920000000002', 'Ben',   '2019-01-01'),
             ('920000000003', 'Carlo', '2018-01-01'),
             ('920000000004', 'Dan',   null),
             ('920000000005', 'Eve',   '2019-06-01'),
             ('920000000006', 'Fay',   '2019-02-01')) v(lrn, fn, bd);

insert into pta.student_enrollments (school_id, student_id, school_year_id, section_id, grade_level, status)
select :'school_a', s.id, :'fy', case when v.grade = 'Grade 7' then :'g7sec'::uuid end, v.grade, 'enrolled'
from (values ('920000000001', 'Grade 9'), ('920000000002', 'Grade 7'),
             ('920000000003', 'Grade 8'), ('920000000004', 'Grade 8'),
             ('920000000005', 'Grade 7'), ('920000000006', 'Grade 7')) v(lrn, grade)
join pta.students s on s.lrn = v.lrn and s.school_id = :'school_a';

insert into pta.parents_guardians (school_id, first_name, last_name)
values (:'school_a', 'Mom', 'Fam'), (:'school_a', 'Lola', 'Fam'), (:'school_a', 'Dad', 'Fam3');
select id as mom  from pta.parents_guardians where first_name = 'Mom'  and last_name = 'Fam' \gset
select id as lola from pta.parents_guardians where first_name = 'Lola' and last_name = 'Fam' \gset
select id as dad  from pta.parents_guardians where first_name = 'Dad'  and last_name = 'Fam3' \gset

insert into pta.student_guardians (school_id, student_id, guardian_id, relationship, is_primary)
select :'school_a', s.id, v.g::uuid, 'Guardian', v.prim
from (values ('920000000001', :'mom',  true),
             ('920000000002', :'mom',  true),
             ('920000000002', :'lola', false),
             ('920000000003', :'lola', true),
             ('920000000005', :'dad',  true),
             ('920000000006', :'dad',  true)) v(lrn, g, prim)
join pta.students s on s.lrn = v.lrn and s.school_id = :'school_a';

insert into pta.fee_types (school_id, name, category, default_amount, billing_basis)
values (:'school_a', 'PTA family contribution', 'annual', 500, 'per_family'),
       (:'school_a', 'Grade 7 family outing',  'special', 200, 'per_family'),
       (:'school_a', 'School ID 2031',          'special', 50, 'per_student');
select id as famfee from pta.fee_types where name = 'PTA family contribution' \gset
select id as outing from pta.fee_types where name = 'Grade 7 family outing' \gset
select id as idfee  from pta.fee_types where name = 'School ID 2031' \gset

-- Who carries a charge, by first name.
create or replace function pg_temp.carriers(p_fee uuid) returns text language sql as $$
  select string_agg(s.first_name, ',' order by s.first_name)
  from pta.student_charges c join pta.students s on s.id = c.student_id
  where c.fee_type_id = p_fee and c.status <> 'cancelled'
$$;

select pta_test.login(:A_ADMIN::uuid);

-- ---------------------------------------------------------------------------
-- What a family is
-- ---------------------------------------------------------------------------
select pta_test.eq(
  (select count(distinct f.family_id)::int
     from pta.student_families(:'school_a', :'fy') f
     join pta.students s on s.id = f.student_id
    where s.first_name in ('Ana', 'Ben', 'Carlo')),
  1,
  'FF1. Children linked through different shared guardians are one family');

select pta_test.eq(
  (select student_count || '/' || family_count from pta.assessment_scope_count(:'school_a', :'fy')),
  '6/3',
  'FF2. The preview counts 6 students in 3 families');

select pta_test.eq(
  (select billing_basis from pta.fee_types
    where school_id = :'school_a' and name = 'PTA Annual Membership'),
  'per_student',
  'FF3. Existing fees stay per student');

-- ---------------------------------------------------------------------------
-- Assessing
-- ---------------------------------------------------------------------------
select * from pta.assess_fees_scoped(:'school_a', :'fy', array[:'famfee']::uuid[]) \gset r1_
select pta_test.eq(:r1_created_count, 3, 'FF4. A per-family fee creates one charge per family');
select pta_test.eq(pg_temp.carriers(:'famfee'), 'Ana,Dan,Fay',
  'FF5. The eldest carries it: highest grade (Ana), then earliest birth date (Fay); a child with no parent is charged');

select * from pta.assess_fees_scoped(:'school_a', :'fy', array[:'famfee']::uuid[]) \gset r2_
select pta_test.eq(:r2_created_count || '/' || :r2_skipped_count, '0/3',
  'FF6. Re-assessing a per-family fee charges nobody again');

-- A new, older sibling arrives. The family has already been charged.
select pta_test.logout();
insert into pta.students (school_id, lrn, first_name, last_name, sex)
values (:'school_a', '920000000007', 'Gio', 'Fam', 'M');
insert into pta.student_enrollments (school_id, student_id, school_year_id, grade_level, status)
select :'school_a', id, :'fy', 'Grade 10', 'enrolled' from pta.students where lrn = '920000000007';
insert into pta.student_guardians (school_id, student_id, guardian_id, relationship, is_primary)
select :'school_a', id, :'mom', 'Mother', true from pta.students where lrn = '920000000007';
select pta_test.login(:A_ADMIN::uuid);

select * from pta.assess_fees_scoped(:'school_a', :'fy', array[:'famfee']::uuid[]) \gset r3_
select pta_test.eq(:r3_created_count, 0,
  'FF7. A late-enrolled sibling does not charge an already-charged family again, even when older');

-- Mixed: a per-student fee alongside, in one run.
select * from pta.assess_fees_scoped(:'school_a', :'fy', array[:'idfee', :'famfee']::uuid[]) \gset r4_
select pta_test.eq(:r4_created_count, 7,
  'FF8. Assessed together, the per-student fee reaches all 7 and the family fee none');

-- Scoped to one section: the eldest IN SCOPE carries it.
select * from pta.assess_fees_scoped(:'school_a', :'fy', array[:'outing']::uuid[],
  null, array[:'g7sec']::uuid[]) \gset r5_
select pta_test.eq(pg_temp.carriers(:'outing'), 'Ben,Fay',
  'FF9. Scoped to Grade 7, each family''s eldest Grade 7 child carries it');

-- A cancelled charge does not count as the family having been charged.
select pta_test.logout();
update pta.student_charges set status = 'cancelled', status_reason = 'test'
 where fee_type_id = :'outing';
select pta_test.login(:A_ADMIN::uuid);
select * from pta.assess_fees_scoped(:'school_a', :'fy', array[:'outing']::uuid[],
  null, array[:'g7sec']::uuid[]) \gset r6_
select pta_test.eq(:r6_created_count, 2,
  'FF10. After cancelling, the family can be charged again');

select pta_test.ok(
  (select (new_values ->> 'families')::int = 2 from pta.audit_logs
    where action = 'FEES_ASSESSED' order by created_at desc, id desc limit 1),
  'FF11. The audit row records how many families were assessed');

select pta_test.logout();
