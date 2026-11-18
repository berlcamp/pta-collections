-- 11_homeroom.sql — migration 0026: assessing one grade or one section.
--
-- Builds its own school year, sections and students in School A rather than
-- leaning on 02_fixtures', which 08_promotion has graduated by the time this
-- runs.

\set A_ADMIN   '''22222222-2222-2222-2222-222222222222'''
\set A_TREAS   '''44444444-4444-4444-4444-444444444444'''
\set B_ADMIN   '''55555555-5555-5555-5555-555555555555'''

select pta_test.login(:A_ADMIN::uuid);

insert into pta.school_years (school_id, name, start_date, end_date, is_active, created_by)
select id, '2030-2031', '2030-06-01', '2031-03-31', false, pta.current_profile_id()
from pta.schools where school_code = 'ONHS';

insert into pta.sections (school_id, school_year_id, grade_level, name, created_by)
select s.id, sy.id, v.grade, v.name, pta.current_profile_id()
from pta.schools s
join pta.school_years sy on sy.school_id = s.id and sy.name = '2030-2031',
     (values ('Grade 7', 'Rizal'), ('Grade 7', 'Mabini'), ('Grade 8', 'Luna')) v(grade, name)
where s.school_code = 'ONHS';

insert into pta.students (school_id, lrn, first_name, last_name, sex, created_by)
select s.id, v.lrn, v.fn, v.ln, 'F', pta.current_profile_id()
from pta.schools s,
     (values ('900000000001', 'Ana',   'Rizal-One'),
             ('900000000002', 'Bea',   'Rizal-Two'),
             ('900000000003', 'Cora',  'Mabini-One'),
             ('900000000004', 'Dina',  'Luna-One'),
             ('900000000005', 'Elsa',  'Rizal-Dropped')) v(lrn, fn, ln)
where s.school_code = 'ONHS';

insert into pta.student_enrollments
  (school_id, student_id, school_year_id, section_id, grade_level, status, created_by)
select st.school_id, st.id, sy.id, sec.id, sec.grade_level,
       case when st.lrn = '900000000005' then 'dropped' else 'enrolled' end,
       pta.current_profile_id()
from pta.students st
join pta.school_years sy on sy.school_id = st.school_id and sy.name = '2030-2031'
join pta.sections sec on sec.school_year_id = sy.id and sec.name = case
       when st.last_name like 'Rizal%'  then 'Rizal'
       when st.last_name like 'Mabini%' then 'Mabini'
       else 'Luna' end
where st.lrn like '9000000000%';

insert into pta.fee_types (school_id, name, category, default_amount, created_by)
select id, 'Homeroom contribution', 'homeroom', null, pta.current_profile_id()
from pta.schools where school_code = 'ONHS';

insert into pta.fee_types (school_id, name, category, default_amount, created_by)
select id, 'Grade 7 field trip', 'special', 300, pta.current_profile_id()
from pta.schools where school_code = 'ONHS';

select pta_test.logout();

-- Handy ids, read as the owner.
select sy.id as hr_year, s.id as school_a
  from pta.school_years sy join pta.schools s on s.id = sy.school_id
 where sy.name = '2030-2031' \gset
select id as homeroom from pta.fee_types where name = 'Homeroom contribution' \gset
select id as trip     from pta.fee_types where name = 'Grade 7 field trip' \gset
select id as rizal    from pta.sections where name = 'Rizal'  and school_year_id = :'hr_year' \gset
select id as mabini   from pta.sections where name = 'Mabini' and school_year_id = :'hr_year' \gset
select s.id as b_section from pta.sections s join pta.schools sc on sc.id = s.school_id
 where sc.school_code = 'TNHS' limit 1 \gset

-- ---------------------------------------------------------------------------
-- The category
-- ---------------------------------------------------------------------------
select pta_test.eq(
  (select category from pta.fee_types where id = :'homeroom'),
  'homeroom',
  'HR1. A fee type can be in the homeroom category');

-- ---------------------------------------------------------------------------
-- Who may assess
-- ---------------------------------------------------------------------------
select pta_test.login(:A_TREAS::uuid);
select pta_test.throws(format($$ select * from pta.assess_fees_scoped(%L, %L, array[%L]::uuid[], null, array[%L]::uuid[], 200) $$,
  :'school_a', :'hr_year', :'homeroom', :'rizal'),
  'HR2. A treasurer cannot assess fees');
select pta_test.logout();

select pta_test.login(:B_ADMIN::uuid);
select pta_test.throws(format($$ select * from pta.assess_fees_scoped(%L, %L, array[%L]::uuid[], null, array[%L]::uuid[], 200) $$,
  :'school_a', :'hr_year', :'homeroom', :'rizal'),
  'HR3. Another school''s admin cannot assess this school''s sections');
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- Refusals
-- ---------------------------------------------------------------------------
select pta_test.login(:A_ADMIN::uuid);

select pta_test.throws(format($$ select * from pta.assess_fees_scoped(%L, %L, array[%L]::uuid[], null, array[%L]::uuid[], 200) $$,
  :'school_a', :'hr_year', :'homeroom', :'b_section'),
  'HR4. A section from another school is refused, not silently matched to nobody');

select pta_test.throws(format($$ select * from pta.assess_fees_scoped(%L, %L, array[%L]::uuid[], array['Grade 7'], array[%L]::uuid[], 200) $$,
  :'school_a', :'hr_year', :'homeroom', :'rizal'),
  'HR5. Grades and sections cannot both be given');

select pta_test.throws(format($$ select * from pta.assess_fees_scoped(%L, %L, array[%L, %L]::uuid[], null, array[%L]::uuid[], 200) $$,
  :'school_a', :'hr_year', :'homeroom', :'trip', :'rizal'),
  'HR6. An amount cannot override more than one fee type');

select pta_test.throws(format($$ select * from pta.assess_fees_scoped(%L, %L, array[%L]::uuid[], null, array[%L]::uuid[], 0) $$,
  :'school_a', :'hr_year', :'homeroom', :'rizal'),
  'HR7. A zero amount is refused');

-- ---------------------------------------------------------------------------
-- One section, its own amount
-- ---------------------------------------------------------------------------
select * from pta.assess_fees_scoped(:'school_a', :'hr_year', array[:'homeroom']::uuid[],
  null, array[:'rizal']::uuid[], 200) \gset r1_

select pta_test.eq(:r1_created_count, 2,
  'HR8. Assessing Rizal charges its two enrolled students and not the dropped one');

select pta_test.eq(
  (select count(*)::int from pta.student_charges c
     join pta.student_enrollments e on e.student_id = c.student_id and e.school_year_id = c.school_year_id
    where c.fee_type_id = :'homeroom' and e.section_id <> :'rizal'),
  0,
  'HR9. Nobody outside Rizal was charged');

select pta_test.ok(
  (select bool_and(amount = 200) from pta.student_charges where fee_type_id = :'homeroom'),
  'HR10. The charge carries the amount given, not the fee''s (empty) default');

-- A different room, a different amount, the same fee type.
select * from pta.assess_fees_scoped(:'school_a', :'hr_year', array[:'homeroom']::uuid[],
  null, array[:'mabini']::uuid[], 150) \gset r2_

select pta_test.eq(
  (select amount from pta.student_charges c join pta.students st on st.id = c.student_id
    where c.fee_type_id = :'homeroom' and st.first_name = 'Cora'),
  150.00::numeric,
  'HR11. One homeroom fee type carries a different amount per section');

-- Re-running at another amount keeps the first charges.
select * from pta.assess_fees_scoped(:'school_a', :'hr_year', array[:'homeroom']::uuid[],
  null, array[:'rizal']::uuid[], 999) \gset r3_
select pta_test.eq(:r3_created_count || '/' || :r3_skipped_count, '0/2',
  'HR12. Re-assessing a section is idempotent, even at a different amount');

select pta_test.ok(
  not exists (select 1 from pta.student_charges where fee_type_id = :'homeroom' and amount = 999),
  'HR13. Re-assessing never reprices an existing charge');

-- ---------------------------------------------------------------------------
-- One grade, the default amount
-- ---------------------------------------------------------------------------
select * from pta.assess_fees_scoped(:'school_a', :'hr_year', array[:'trip']::uuid[],
  array['Grade 7'], null, null) \gset r4_
select pta_test.eq(:r4_created_count, 3,
  'HR14. Assessing Grade 7 reaches both of its sections and not Grade 8');
select pta_test.ok(
  (select bool_and(amount = 300) from pta.student_charges where fee_type_id = :'trip'),
  'HR15. With no amount given, the fee''s default is used');

select pta_test.eq(
  (select new_values->>'scope' from pta.audit_logs
    where action = 'FEES_ASSESSED' order by created_at desc, id desc limit 1),
  'grades',
  'HR16. The audit row records the scope');

-- ---------------------------------------------------------------------------
-- The section summary
-- ---------------------------------------------------------------------------
select pta_test.eq(
  (select charged || '/' || collected || '/' || balance || '/' || student_count || '/' || unpaid_count
     from pta.v_section_charge_summary
    where section_id = :'rizal' and fee_type_id = :'homeroom'),
  '400.00/0/400.00/2/2',
  'HR17. The section summary totals Rizal''s homeroom charges');

select pta_test.logout();

select pta_test.login(:B_ADMIN::uuid);
select pta_test.eq(
  (select count(*)::int from pta.v_section_charge_summary where school_year_id = :'hr_year'),
  0,
  'HR18. Another school sees none of this school''s section summary');
select pta_test.logout();
