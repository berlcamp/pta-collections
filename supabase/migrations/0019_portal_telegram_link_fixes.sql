-- 0019_portal_telegram_link_fixes.sql
-- Two bugs in the portal's Telegram linking, both found in the field.
--
-- ---------------------------------------------------------------------------
-- 1. EVERY TAP KILLED THE LINK ALREADY IN THE PARENT'S TELEGRAM
-- ---------------------------------------------------------------------------
-- 0016's portal_issue_enroll_token() retires any live token before minting a
-- new one, so that pressing the button twice leaves one credential outstanding
-- rather than two. Sound intent, wrong mechanism: the credential it retires is
-- the one the parent is holding.
--
-- Observed in production -- eight tokens in seven minutes, each expiring the
-- instant the next was minted:
--
--     13:11:20 -> expires 13:11:25      13:12:08 -> expires 13:12:11
--     13:11:25 -> expires 13:11:30      13:12:11 -> expires 13:18:48
--     ...
--
-- A parent taps, switches to Telegram, is unsure anything happened, switches
-- back, taps again -- and has just invalidated the link Telegram is showing
-- them. They press START and are told it expired. The button was punishing the
-- exact behaviour that an app-switch on a phone reliably produces.
--
-- Now a still-live token is REUSED. Repeated taps return the same link, which
-- keeps "at most one live credential per guardian" while making the button
-- idempotent. p_force is the deliberate escape hatch behind "Get a new link",
-- for a parent whose link genuinely expired while they hunted for the app.
--
-- ---------------------------------------------------------------------------
-- 2. LINKING A CHAT THAT WAS ALREADY LINKED RAISED
-- ---------------------------------------------------------------------------
-- 0013 put a UNIQUE index on (school_id, telegram_chat_id). Its own office-slip
-- path never trips it, because that path FINDS the guardian by chat_id and
-- reuses them. 0016's portal path assigns blindly:
--
--     update pta.parents_guardians set telegram_chat_id = p_chat_id ...
--
-- so a parent whose Telegram was already linked to some other guardian at that
-- school -- an earlier office slip, a test, a person who changed their name --
-- hit a unique violation, and the bot answered "Something went wrong."
--
-- The chat now MOVES. The person doing this authenticated with a parent card,
-- and Telegram supplies the chat_id from the account actually sending /start,
-- so the only chat anybody can move is their own. That makes it safe, and it is
-- also the right answer: one Telegram account belongs to one guardian, and the
-- most recent authenticated claim is the truthful one. The guardian it moves
-- away from stops notifying, or the school would be messaging a stale identity
-- about a child it no longer represents.
--
-- Apply by hand in the SQL Editor, in order, like every other migration here.
-- Never `supabase db push`: the project is shared with construction-saas and
-- sms-demo.

-- ---------------------------------------------------------------------------
-- portal_issue_enroll_token(p_force) -- reuse by default
-- ---------------------------------------------------------------------------

drop function if exists pta.portal_issue_enroll_token();

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

  select coalesce(ss.value ->> 'username', ss.value #>> '{}') into v_bot
    from pta.school_settings ss
   where ss.school_id = v_school and ss.key = 'telegram_bot';

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

-- ---------------------------------------------------------------------------
-- redeem_enroll_token -- move the chat instead of colliding with it
-- ---------------------------------------------------------------------------

create or replace function pta.redeem_enroll_token(
  p_token        text,
  p_chat_id      text,
  p_display_name text
) returns jsonb
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
declare
  tok        record;
  v_guardian uuid;
  v_student  record;
  v_name     text;
  v_first    text;
  v_last     text;
  v_count    int := 0;
  v_moved    uuid;
begin
  select * into tok
    from pta.guardian_enroll_tokens
   where token = p_token
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_token');
  end if;
  if tok.used_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_used');
  end if;
  if tok.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  if tok.guardian_id is not null then
    -- PORTAL PATH. The person is already on file and already authenticated;
    -- we are only attaching a chat_id to them.
    v_guardian := tok.guardian_id;

    -- Release the chat from anyone else at this school first. The unique index
    -- guardians_telegram_idx is on (school_id, telegram_chat_id), so at most
    -- one row can match, and without this the update below raises 23505.
    for v_moved in
      select g.id from pta.parents_guardians g
       where g.school_id = tok.school_id
         and g.telegram_chat_id = p_chat_id
         and g.id <> v_guardian
    loop
      update pta.parents_guardians
         set telegram_chat_id = null, telegram_active = false
       where id = v_moved;
      -- Stop notifying through the identity it just left, or the school keeps
      -- messaging a guardian row that no longer has a way to receive anything.
      update pta.student_guardians set notify = false where guardian_id = v_moved;
    end loop;

    update pta.parents_guardians
       set telegram_chat_id   = p_chat_id,
           telegram_active    = true,
           telegram_linked_at = coalesce(telegram_linked_at, now())
     where id = v_guardian;

    -- One tap covers the whole family.
    update pta.student_guardians
       set notify = true
     where guardian_id = v_guardian;

    select count(*) into v_count
      from pta.student_guardians where guardian_id = v_guardian;
  else
    -- OFFICE-SLIP PATH. Unchanged from 0013: find-or-create by chat_id, which
    -- is why this path never collided with the unique index.
    v_name  := coalesce(nullif(btrim(p_display_name), ''), 'Guardian');
    v_last  := coalesce((regexp_match(v_name, '(\S+)$'))[1], v_name);
    v_first := coalesce(nullif(btrim(regexp_replace(v_name, '\s+\S+$', '')), ''), v_name);

    select id into v_guardian
      from pta.parents_guardians
     where school_id = tok.school_id
       and telegram_chat_id = p_chat_id;

    if v_guardian is null then
      insert into pta.parents_guardians
        (school_id, first_name, last_name, telegram_chat_id, telegram_active, telegram_linked_at)
      values
        (tok.school_id, v_first, v_last, p_chat_id, true, now())
      returning id into v_guardian;
    else
      update pta.parents_guardians
         set telegram_active    = true,
             telegram_linked_at = coalesce(telegram_linked_at, now())
       where id = v_guardian;
    end if;

    insert into pta.student_guardians
      (school_id, student_id, guardian_id, relationship, notify)
    values
      (tok.school_id, tok.student_id, v_guardian, tok.relationship, true)
    on conflict (student_id, guardian_id) do update set notify = true;

    v_count := 1;
  end if;

  update pta.guardian_enroll_tokens
     set used_at = now(), guardian_id = v_guardian
   where token = p_token;

  select pta.display_name(s.last_name, s.first_name, s.middle_name, s.suffix) as name,
         coalesce(e.student_number, s.lrn) as no
    into v_student
    from pta.students s
    left join pta.student_enrollments e on e.student_id = s.id
   where s.id = tok.student_id
   limit 1;

  return jsonb_build_object(
    'ok', true,
    'guardian_id',  v_guardian,
    'student_name', v_student.name,
    'student_no',   v_student.no,
    'children',     v_count
  );
end;
$$;

revoke all on function pta.portal_issue_enroll_token(boolean) from public;
revoke all on function pta.redeem_enroll_token(text, text, text) from public;

grant execute on function pta.portal_issue_enroll_token(boolean) to authenticated;
grant execute on function pta.redeem_enroll_token(text, text, text) to service_role;
