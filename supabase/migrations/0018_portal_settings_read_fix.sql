-- 0018_portal_settings_read_fix.sql
-- Re-assert the two portal settings readers, tolerantly.
--
-- WHY THIS EXISTS, AND WHY IT IS NOT AN EDIT TO 0016
-- 0016 originally read the Telegram bot username as `value ->> 'username'`,
-- expecting {"username": "..."}. When /admin/settings was added it writes a
-- bare JSON string instead -- "keri_bot" -- and `->> 'username'` on a JSON
-- string is NULL, so the portal's notification page reported that the school
-- had not set up its bot while the setting sat plainly in the table.
--
-- 0016 was corrected in place to coalesce both shapes. That was a mistake: by
-- then it had already been applied to production, so the correction only
-- reached databases created afterwards, and the live one kept the old
-- expression with no way to tell from the repo. An applied migration is
-- history; this is the fix, and it is additive.
--
-- Both readers accept EITHER shape on purpose. school_settings is a key/value
-- table that gets hand-edited in the SQL Editor, and {"username": "..."} is the
-- shape somebody will reasonably type. Silently resolving to NULL is the worst
-- of the available behaviours: nothing errors, and a working setting looks
-- absent.
--
-- v_portal_account is NOT re-created here -- 0017 already rebuilt it carrying
-- the same coalesce for gcash_number, so any database with 0017 is correct.
--
-- Safe to re-run. Apply by hand in the SQL Editor, in order, like every other
-- migration here. Never `supabase db push`: the project is shared with
-- construction-saas and sms-demo.

create or replace view pta.v_portal_telegram
with (security_invoker = off) as
select
  g.id                as guardian_id,
  g.school_id,
  g.telegram_chat_id is not null as is_linked,
  g.telegram_active,
  g.telegram_linked_at,
  (select count(*) from pta.student_guardians sg
    where sg.guardian_id = g.id and sg.notify) as notifying_children,
  (select count(*) from pta.student_guardians sg
    where sg.guardian_id = g.id)               as total_children,
  (select coalesce(ss.value ->> 'username', ss.value #>> '{}')
     from pta.school_settings ss
    where ss.school_id = g.school_id and ss.key = 'telegram_bot') as bot_username
from pta.parents_guardians g
where g.id = pta.current_guardian_id();

-- The same lookup, in the verb that builds the deep link. Without this the
-- guide page would show a connect button that mints a token and then has no
-- https://t.me/<bot> to send the parent to.
create or replace function pta.portal_issue_enroll_token()
returns jsonb
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
declare
  v_gid     uuid := pta.current_guardian_id();
  v_school  uuid;
  v_student uuid;
  v_token   text;
  v_bot     text;
begin
  if v_gid is null then
    raise exception 'Not a portal session.' using errcode = '42501';
  end if;

  v_school := pta.current_guardian_school_id();

  select sg.student_id into v_student
    from pta.student_guardians sg
   where sg.guardian_id = v_gid
   order by sg.is_primary desc
   limit 1;

  if v_student is null then
    return jsonb_build_object('ok', false, 'reason', 'no_children');
  end if;

  -- Retire any token still live for this guardian, so pressing the button
  -- twice leaves one credential outstanding rather than two.
  update pta.guardian_enroll_tokens
     set expires_at = now()
   where guardian_id = v_gid and used_at is null and expires_at > now();

  v_token := pta.issue_enroll_token(v_student, 'Guardian', interval '15 minutes', v_gid);

  select coalesce(ss.value ->> 'username', ss.value #>> '{}') into v_bot
    from pta.school_settings ss
   where ss.school_id = v_school and ss.key = 'telegram_bot';

  insert into pta.audit_logs (school_id, action, entity_type, entity_id)
  values (v_school, 'PORTAL_TELEGRAM_TOKEN_ISSUED', 'parents_guardian', v_gid);

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'bot_username', v_bot,
    'deep_link', case when v_bot is null then null
                      else 'https://t.me/' || v_bot || '?start=' || v_token end,
    'expires_at', now() + interval '15 minutes'
  );
end;
$$;

grant select on pta.v_portal_telegram to authenticated;
revoke all  on pta.v_portal_telegram from anon;

revoke all on function pta.portal_issue_enroll_token()    from public;
grant execute on function pta.portal_issue_enroll_token() to authenticated;
