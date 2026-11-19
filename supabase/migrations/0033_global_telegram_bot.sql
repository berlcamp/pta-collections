-- 0033_global_telegram_bot.sql — one Telegram bot for every school.
--
-- There is one TELEGRAM_BOT_TOKEN for the whole deployment (CLAUDE.md), so
-- every school's parents already talk to the same bot. The per-school
-- `school_settings.telegram_bot` row only built the deep link, and each school
-- admin had to type the same handle into their own settings — or leave it
-- blank, and the portal silently dropped its Telegram step for that school.
--
-- Now the handle is one global setting, set by the super admin:
--
--   pta.app_settings        deployment-wide key/value, super admin writes.
--   pta.telegram_bot_username(school)
--                           the ONE reader: the global handle, falling back to
--                           the school's old row while a deployment has not set
--                           a global one yet. Nothing else may read either.
--
-- The two places that built the deep link — v_portal_telegram (last defined
-- in 0018) and portal_issue_enroll_token() (last defined in 0019) — are
-- redefined here to call it; their bodies are otherwise carried over verbatim.
-- The school rows are left in place (history, and the fallback); the app no
-- longer writes them.
--
-- A bot's @handle is public — it is printed on posters — so app_settings is
-- readable by any signed-in staff member; only a super admin writes it.

create table pta.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid references pta.profiles(id) default pta.current_profile_id(),
  updated_at timestamptz not null default now()
);

create trigger app_settings_set_updated_at
  before update on pta.app_settings
  for each row execute function pta.set_updated_at();

alter table pta.app_settings enable row level security;

create policy app_settings_read on pta.app_settings for select to authenticated
using (true);

create policy app_settings_super_write on pta.app_settings for all to authenticated
using (pta.is_super_admin())
with check (pta.is_super_admin());

revoke all on pta.app_settings from public, anon;
grant select, insert, update, delete on pta.app_settings to authenticated;

-- Seed from what the schools already use, so nothing changes on apply. If
-- schools disagree, the most common handle wins; a single school's own row
-- keeps working through the fallback either way.
insert into pta.app_settings (key, value, updated_by)
select 'telegram_bot', to_jsonb(handle), null
from (
  select coalesce(ss.value ->> 'username', ss.value #>> '{}') as handle, count(*) as n
  from pta.school_settings ss
  where ss.key = 'telegram_bot'
  group by 1
  order by n desc, handle
  limit 1
) seed
where nullif(trim(handle), '') is not null
on conflict (key) do nothing;

create or replace function pta.telegram_bot_username(p_school_id uuid)
returns text
language sql
stable
security definer
set search_path = pta, public
as $$
  select coalesce(
    (select nullif(trim(coalesce(a.value ->> 'username', a.value #>> '{}')), '')
       from pta.app_settings a where a.key = 'telegram_bot'),
    (select nullif(trim(coalesce(ss.value ->> 'username', ss.value #>> '{}')), '')
       from pta.school_settings ss
      where ss.school_id = p_school_id and ss.key = 'telegram_bot')
  );
$$;

revoke execute on function pta.telegram_bot_username(uuid) from public, anon;
grant  execute on function pta.telegram_bot_username(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- v_portal_telegram — from 0018, bot_username now via the one reader
-- ---------------------------------------------------------------------------

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
  pta.telegram_bot_username(g.school_id) as bot_username
from pta.parents_guardians g
where g.id = pta.current_guardian_id();

grant select on pta.v_portal_telegram to authenticated;
revoke all  on pta.v_portal_telegram from anon;

-- ---------------------------------------------------------------------------
-- portal_issue_enroll_token — from 0019, the bot lookup now via the one reader
-- ---------------------------------------------------------------------------

create or replace function pta.portal_issue_enroll_token(p_force boolean default false)
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
  v_expires timestamptz;
  v_bot     text;
  v_reused  boolean := false;
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

  if not p_force then
    -- The link already in their hand, if it is still good. Newest first: a
    -- database that pre-dates this migration may hold several.
    select t.token, t.expires_at into v_token, v_expires
      from pta.guardian_enroll_tokens t
     where t.guardian_id = v_gid
       and t.used_at is null
       and t.expires_at > now() + interval '30 seconds'   -- not about to die
     order by t.expires_at desc
     limit 1;

    v_reused := v_token is not null;
  end if;

  if v_token is null then
    -- Retire whatever is live before minting, so "one live credential per
    -- guardian" still holds. This is now reached only on a first press or a
    -- deliberate refresh, never on an accidental double-tap.
    update pta.guardian_enroll_tokens
       set expires_at = now()
     where guardian_id = v_gid and used_at is null and expires_at > now();

    v_token   := pta.issue_enroll_token(v_student, 'Guardian', interval '15 minutes', v_gid);
    v_expires := now() + interval '15 minutes';

    insert into pta.audit_logs (school_id, action, entity_type, entity_id)
    values (v_school, 'PORTAL_TELEGRAM_TOKEN_ISSUED', 'parents_guardian', v_gid);
  end if;

  v_bot := pta.telegram_bot_username(v_school);

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'reused', v_reused,
    'bot_username', v_bot,
    'deep_link', case when v_bot is null then null
                      else 'https://t.me/' || v_bot || '?start=' || v_token end,
    'expires_at', v_expires
  );
end;
$$;

revoke all on function pta.portal_issue_enroll_token(boolean) from public;
grant execute on function pta.portal_issue_enroll_token(boolean) to authenticated;
