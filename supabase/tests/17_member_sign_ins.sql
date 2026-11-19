-- 17_member_sign_ins.sql — migration 0032.

\set A_ADMIN '''22222222-2222-2222-2222-222222222222'''
\set A_TREAS '''44444444-4444-4444-4444-444444444444'''
\set B_ADMIN '''55555555-5555-5555-5555-555555555555'''

update auth.users set last_sign_in_at = '2031-06-10 08:00+08'
 where email = 'cashier.a@example.com';
select id as school_a from pta.schools where school_code = 'ONHS' \gset

select pta_test.login(:A_ADMIN::uuid);
select pta_test.eq(
  (select s.last_sign_in_at from pta.school_member_sign_ins(:'school_a') s
     join pta.profiles p on p.id = s.profile_id where p.email = 'cashier.a@example.com'),
  '2031-06-10 08:00+08'::timestamptz,
  'MS1. An admin sees when each member last signed in');
select pta_test.logout();

select pta_test.login(:A_TREAS::uuid);
select pta_test.throws(format($$ select * from pta.school_member_sign_ins(%L) $$, :'school_a'),
  'MS2. A treasurer cannot read sign-in times');
select pta_test.logout();

select pta_test.login(:B_ADMIN::uuid);
select pta_test.throws(format($$ select * from pta.school_member_sign_ins(%L) $$, :'school_a'),
  'MS3. Another school''s admin cannot read them');
select pta_test.logout();
