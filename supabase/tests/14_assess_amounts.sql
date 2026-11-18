-- 14_assess_amounts.sql — migration 0029: an amount per fee in one run.
-- Reuses 13_family_fees' school year (2031-2032) and its seven students.

\set A_ADMIN '''22222222-2222-2222-2222-222222222222'''

select id as school_a from pta.schools where school_code = 'ONHS' \gset
select id as fy from pta.school_years where name = '2031-2032' and school_id = :'school_a' \gset

insert into pta.fee_types (school_id, name, category, default_amount)
values (:'school_a', 'Homeroom 2031', 'homeroom', null),
       (:'school_a', 'Library 2031',  'annual', 30);
select id as hr  from pta.fee_types where name = 'Homeroom 2031' \gset
select id as lib from pta.fee_types where name = 'Library 2031' \gset

select pta_test.login(:A_ADMIN::uuid);

select pta_test.throws(format($$ select * from pta.assess_fees(%L, %L, %L::jsonb) $$,
  :'school_a', :'fy', jsonb_build_array(jsonb_build_object('fee_type_id', :'hr'), jsonb_build_object('fee_type_id', :'lib'))),
  'AA1. A fee with no default and no amount is refused, by name');

select pta_test.throws(format($$ select * from pta.assess_fees(%L, %L, %L::jsonb) $$,
  :'school_a', :'fy', jsonb_build_array(jsonb_build_object('fee_type_id', :'lib'), jsonb_build_object('fee_type_id', :'lib'))),
  'AA2. The same fee twice is refused');

select pta_test.throws(format($$ select * from pta.assess_fees(%L, %L, %L::jsonb) $$,
  :'school_a', :'fy', jsonb_build_array(jsonb_build_object('fee_type_id', :'lib', 'amount', -5))),
  'AA3. A negative amount is refused');

select * from pta.assess_fees(:'school_a', :'fy', jsonb_build_array(
  jsonb_build_object('fee_type_id', :'hr', 'amount', 175),
  jsonb_build_object('fee_type_id', :'lib'))) \gset r1_

select pta_test.eq(:r1_created_count, 14,
  'AA4. A no-default fee and a default fee go out together in one run');
select pta_test.ok(
  (select bool_and(amount = 175) from pta.student_charges where fee_type_id = :'hr')
  and (select bool_and(amount = 30) from pta.student_charges where fee_type_id = :'lib'),
  'AA5. Each fee carries its own amount: the typed one, or its default');

select pta_test.logout();
