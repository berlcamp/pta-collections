-- 18_global_telegram_bot.sql — migration 0033.

\set SUPER   '''11111111-1111-1111-1111-111111111111'''
\set A_ADMIN '''22222222-2222-2222-2222-222222222222'''

select id as school_a from pta.schools where school_code = 'ONHS' \gset
select id as school_b from pta.schools where school_code = 'TNHS' \gset

-- A school's old per-school row still answers while no global one is set.
delete from pta.app_settings where key = 'telegram_bot';
insert into pta.school_settings (school_id, key, value)
values (:'school_a', 'telegram_bot', '"OldSchoolBot"')
on conflict (school_id, key) do update set value = excluded.value;

select pta_test.eq(pta.telegram_bot_username(:'school_a'), 'OldSchoolBot',
  'GB1. With no global bot, a school''s own setting is used');
select pta_test.eq(pta.telegram_bot_username(:'school_b'), null::text,
  'GB2. A school with neither has no bot');

select pta_test.login(:A_ADMIN::uuid);
select pta_test.throws($$ insert into pta.app_settings (key, value) values ('telegram_bot', '"HijackBot"') $$,
  'GB3. A school admin cannot set the global bot');
select pta_test.logout();

select pta_test.login(:SUPER::uuid);
insert into pta.app_settings (key, value) values ('telegram_bot', '"SharedBot"');
select pta_test.logout();

select pta_test.eq(pta.telegram_bot_username(:'school_a'), 'SharedBot',
  'GB5. The global bot wins over a school''s old row');
select pta_test.eq(pta.telegram_bot_username(:'school_b'), 'SharedBot',
  'GB6. Every school gets the global bot');

select pta_test.login(:A_ADMIN::uuid);
select pta_test.eq(
  (select value #>> '{}' from pta.app_settings where key = 'telegram_bot'),
  'SharedBot',
  'GB4. A school admin can read the global bot handle');
select pta_test.logout();
