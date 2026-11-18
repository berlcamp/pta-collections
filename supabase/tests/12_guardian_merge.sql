-- 12_guardian_merge.sql — migration 0027: duplicate parents and merging them.
--
-- Setup runs as the owner: it is the shape of the data that matters here, and
-- 0022's trigger mints a card on every link exactly as it would for an admin.

\set A_ADMIN   '''22222222-2222-2222-2222-222222222222'''
\set A_TREAS   '''44444444-4444-4444-4444-444444444444'''
\set B_ADMIN   '''55555555-5555-5555-5555-555555555555'''

select id as school_a from pta.schools where school_code = 'ONHS' \gset

insert into pta.students (school_id, lrn, first_name, last_name, sex)
select :'school_a', v.lrn, v.fn, v.ln, 'M'
from (values ('910000000001', 'Juan',  'Santos'),
             ('910000000002', 'Ana',   'Santos'),
             ('910000000003', 'Lito',  'Santos'),
             ('910000000004', 'Rosa',  'Cruz'),
             ('910000000005', 'Ben',   'Reyes'),
             ('910000000006', 'Carla', 'Reyes')) v(lrn, fn, ln);

insert into pta.parents_guardians (school_id, first_name, last_name, contact_number, telegram_chat_id, telegram_active)
values (:'school_a', 'Maria', 'Santos', '09171112222', null, false),
       (:'school_a', 'Ma.',   'Santos', '+639171112222', 'tg-555', true),
       (:'school_a', 'Rosa',  'Cruz-Mother', null, null, false),   -- no children, no card
       (:'school_a', 'Elena', 'Cruz', '09991234567', null, false),
       (:'school_a', 'Pedro', 'Reyes', '09180000001', null, false),
       (:'school_a', 'Pedro', 'Reyes', '09180000002', null, false);

select id as g_maria from pta.parents_guardians where first_name = 'Maria' and last_name = 'Santos' \gset
select id as g_ma    from pta.parents_guardians where first_name = 'Ma.'   and last_name = 'Santos' \gset
select id as g_nocard from pta.parents_guardians where last_name = 'Cruz-Mother' \gset
select id as g_elena from pta.parents_guardians where first_name = 'Elena' \gset
select id as g_p1    from pta.parents_guardians where contact_number = '09180000001' \gset
select id as g_p2    from pta.parents_guardians where contact_number = '09180000002' \gset

insert into pta.student_guardians (school_id, student_id, guardian_id, relationship, is_primary)
select :'school_a', s.id, v.g::uuid, 'Mother', v.prim
from (values ('910000000001', :'g_maria', true),
             ('910000000002', :'g_ma',    true),
             ('910000000004', :'g_elena', true),
             ('910000000005', :'g_p1',    true),
             ('910000000005', :'g_p2',    false),
             ('910000000006', :'g_p2',    true)) v(lrn, g, prim)
join pta.students s on s.lrn = v.lrn and s.school_id = :'school_a';

-- ---------------------------------------------------------------------------
-- Finding them
-- ---------------------------------------------------------------------------
select pta_test.login(:A_ADMIN::uuid);

select pta_test.ok(
  exists (select 1 from pta.v_guardian_duplicates
           where 'same_number' = any (reasons)
             and least(a_id, b_id) = least(:'g_maria'::uuid, :'g_ma'::uuid)
             and greatest(a_id, b_id) = greatest(:'g_maria'::uuid, :'g_ma'::uuid)),
  'GM1. One number written two ways (0917… / +63917…) is found as a duplicate');

select pta_test.ok(
  exists (select 1 from pta.v_guardian_duplicates
           where 'same_name' = any (reasons)
             and least(a_id, b_id) = least(:'g_p1'::uuid, :'g_p2'::uuid)),
  'GM2. The same name with different numbers is found too');

select pta_test.logout();

select pta_test.login(:B_ADMIN::uuid);
select pta_test.eq(
  (select count(*)::int from pta.v_guardian_duplicates where school_id = :'school_a'),
  0,
  'GM3. Another school sees none of this school''s duplicates');
select pta_test.throws(format($$ select pta.merge_guardians(%L, %L) $$, :'g_maria', :'g_ma'),
  'GM4. Another school''s admin cannot merge these parents');
select pta_test.logout();

select pta_test.login(:A_TREAS::uuid);
select pta_test.throws(format($$ select pta.merge_guardians(%L, %L) $$, :'g_maria', :'g_ma'),
  'GM5. A treasurer cannot merge parents');
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- Merging: both hold a card
-- ---------------------------------------------------------------------------
select pta_test.login(:A_ADMIN::uuid);
select pta.merge_guardians(:'g_maria', :'g_ma') as r1 \gset
select pta_test.logout();

select pta_test.eq(
  (select count(*)::int from pta.student_guardians where guardian_id = :'g_maria'),
  2,
  'GM6. The kept parent now has both children');

select pta_test.eq(
  (select status from pta.portal_accounts where guardian_id = :'g_ma'),
  'revoked',
  'GM7. The duplicate''s parent card is revoked, not deleted');

select pta_test.eq(
  (select status from pta.portal_accounts where guardian_id = :'g_maria'),
  'active',
  'GM8. The kept parent''s card still works');

select pta_test.eq(
  (select telegram_chat_id from pta.parents_guardians where id = :'g_maria'),
  'tg-555',
  'GM9. Telegram moves to the kept parent when it had none');

select pta_test.eq(
  (select merged_into from pta.parents_guardians where id = :'g_ma'),
  :'g_maria'::uuid,
  'GM10. The duplicate is kept, marked as merged');

select pta_test.ok(
  exists (select 1 from pta.audit_logs where action = 'GUARDIAN_MERGED' and entity_id = :'g_maria'),
  'GM11. The merge is audited');

-- A later link aimed at the duplicate — an import matching it by name —
-- lands on the survivor.
insert into pta.student_guardians (school_id, student_id, guardian_id, relationship, is_primary)
select :'school_a', id, :'g_ma', 'Mother', true from pta.students where lrn = '910000000003';
select pta_test.eq(
  (select sg.guardian_id from pta.student_guardians sg join pta.students s on s.id = sg.student_id
    where s.lrn = '910000000003'),
  :'g_maria'::uuid,
  'GM12. A new link to a merged parent is redirected to the one it was merged into');

select pta_test.login(:A_ADMIN::uuid);
select pta_test.ok(
  not exists (select 1 from pta.v_guardian_duplicates
               where :'g_ma'::uuid in (a_id, b_id)),
  'GM13. A merged record is no longer listed as a duplicate');
select pta_test.throws(format($$ select pta.merge_guardians(%L, %L) $$, :'g_maria', :'g_ma'),
  'GM14. A record cannot be merged twice');

-- ---------------------------------------------------------------------------
-- Cards: only the duplicate holds one
-- ---------------------------------------------------------------------------
select pta_test.throws(format($$ select pta.merge_guardians(%L, %L) $$, :'g_nocard', :'g_elena'),
  'GM15. Merging away the only record holding a card is refused');

select pta.merge_guardians(:'g_elena', :'g_nocard') as r2 \gset
select pta_test.ok(
  (select merged_into = :'g_elena'::uuid from pta.parents_guardians where id = :'g_nocard'),
  'GM16. Keeping the card-holder instead works');

-- ---------------------------------------------------------------------------
-- A child linked to both: one link survives, primary carried over
-- ---------------------------------------------------------------------------
select pta.merge_guardians(:'g_p2', :'g_p1') as r3 \gset
select pta_test.eq(
  (select count(*)::int || '/' || bool_and(sg.is_primary)::text
     from pta.student_guardians sg join pta.students s on s.id = sg.student_id
    where s.lrn = '910000000005'),
  '1/true',
  'GM17. A child of both keeps one link, and it stays primary');
select pta_test.eq((:'r3'::jsonb ->> 'children_shared')::int, 1,
  'GM18. The merge reports the shared child');

-- ---------------------------------------------------------------------------
-- Not the same person
-- ---------------------------------------------------------------------------
insert into pta.parents_guardians (school_id, first_name, last_name, contact_number)
values (:'school_a', 'Jose', 'Lim', '09221110000'),
       (:'school_a', 'Josie', 'Lim', '09221110000');
select pta_test.logout();
select least(a.id, b.id) as d_a, greatest(a.id, b.id) as d_b
  from pta.parents_guardians a, pta.parents_guardians b
 where a.first_name = 'Jose' and b.first_name = 'Josie' \gset
select pta_test.login(:A_ADMIN::uuid);

insert into pta.guardian_duplicate_dismissals (school_id, guardian_a, guardian_b)
values (:'school_a', :'d_a', :'d_b');
select pta_test.ok(
  not exists (select 1 from pta.v_guardian_duplicates where a_id = :'d_a' and b_id = :'d_b'),
  'GM19. A pair marked "not the same person" is no longer listed');
select pta_test.logout();

select pta_test.login(:A_TREAS::uuid);
select pta_test.throws(format($$ insert into pta.guardian_duplicate_dismissals (school_id, guardian_a, guardian_b) values (%L, least(%L::uuid, %L::uuid), greatest(%L::uuid, %L::uuid)) $$,
  :'school_a', :'g_maria', :'g_elena', :'g_maria', :'g_elena'),
  'GM20. Only an admin can dismiss a duplicate');
select pta_test.logout();
