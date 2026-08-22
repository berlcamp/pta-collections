-- 0007_rpc_auth.sql
-- pta.claim_invite()  (D4/D5)
--
-- WHY THIS IS NOT A TRIGGER ON auth.users:
--   This Supabase project is shared with construction-saas and sms-demo. A
--   trigger on auth.users that raises — a constraint violation, a bad
--   search_path, a dropped column — breaks signup for EVERY app on the project,
--   and you would debug it from an unrelated codebase. Lazy provisioning has
--   zero blast radius.
--   It also handles the case an AFTER INSERT trigger structurally cannot: an
--   invitee who already exists in auth.users because they use another app on
--   this project. With 3+ apps sharing the pool that is the likely case, not
--   an edge case.
--
-- WHAT WE CAN AND CANNOT GUARANTEE:
--   Supabase WILL mint a session for any Google account that clicks through;
--   there is no per-app way to prevent that on a shared project (the
--   Before-User-Created hook is project-wide and would break the other apps).
--   What is guaranteed instead: an uninvited account gets no profile row, no
--   membership, zero rows from every table under RLS, and is signed out by
--   middleware. Do not "fix" this with a hook.

create or replace function pta.claim_invite()
returns pta.profiles
language plpgsql
security definer
set search_path = pta, public
as $$
declare
  v_uid       uuid := auth.uid();
  v_email     text;
  v_name      text;
  v_avatar    text;
  v_profile   pta.profiles;
  v_invite    pta.school_user_invites;
begin
  if v_uid is null then
    return null;
  end if;

  select lower(u.email),
         coalesce(u.raw_user_meta_data ->> 'full_name',
                  u.raw_user_meta_data ->> 'name',
                  split_part(u.email, '@', 1)),
         u.raw_user_meta_data ->> 'avatar_url'
    into v_email, v_name, v_avatar
  from auth.users u
  where u.id = v_uid;

  if v_email is null then
    return null;
  end if;

  -- 1. Already provisioned — refresh the display snapshot and return.
  select * into v_profile from pta.profiles where auth_user_id = v_uid;
  if found then
    update pta.profiles
       set full_name  = coalesce(nullif(v_name, ''), full_name),
           avatar_url = coalesce(v_avatar, avatar_url),
           email      = v_email
     where id = v_profile.id
     returning * into v_profile;
    return v_profile;
  end if;

  -- 2. An unbound profile exists for this email: the super-admin bootstrap row,
  --    or someone re-invited after their auth user was removed by another app.
  select * into v_profile
  from pta.profiles
  where email = v_email and auth_user_id is null;

  if found then
    update pta.profiles
       set auth_user_id = v_uid,
           full_name    = coalesce(nullif(v_name, ''), full_name),
           avatar_url   = coalesce(v_avatar, avatar_url)
     where id = v_profile.id
     returning * into v_profile;

    perform pta.write_audit(null, 'PROFILE_BOUND', 'profile', v_profile.id,
                            null, jsonb_build_object('email', v_email));
  end if;

  -- 3. Find a live invitation for this exact address.
  select * into v_invite
  from pta.school_user_invites
  where email = v_email
    and status = 'pending'
    and expires_at > now()
  order by created_at desc
  limit 1;

  -- No invite and no existing profile: uninvited. Caller signs them out.
  if not found and v_profile.id is null then
    return null;
  end if;

  -- Create the profile if the invite is what admitted them.
  if v_profile.id is null then
    insert into pta.profiles (auth_user_id, email, full_name, avatar_url, global_role)
    values (v_uid, v_email, coalesce(nullif(v_name, ''), v_invite.full_name), v_avatar, 'user')
    returning * into v_profile;
  end if;

  -- Apply the membership.
  if v_invite.id is not null then
    insert into pta.school_users (school_id, profile_id, role, status, created_by)
    values (v_invite.school_id, v_profile.id, v_invite.role, 'active', v_invite.invited_by)
    on conflict (school_id, profile_id) do update
      set role   = excluded.role,
          status = 'active';

    update pta.school_user_invites set status = 'accepted' where id = v_invite.id;

    perform pta.write_audit(v_invite.school_id, 'USER_INVITE_CLAIMED', 'school_user',
                            v_profile.id, null,
                            jsonb_build_object('email', v_email, 'role', v_invite.role));
  end if;

  return v_profile;
end;
$$;

revoke execute on function pta.claim_invite() from public;
grant execute on function pta.claim_invite() to authenticated;

-- Expire stale invites. Safe to call from anywhere; idempotent.
create or replace function pta.expire_stale_invites()
returns integer
language sql
security definer
set search_path = pta, public
as $$
  with expired as (
    update pta.school_user_invites
       set status = 'expired'
     where status = 'pending' and expires_at <= now()
     returning 1
  )
  select count(*)::integer from expired;
$$;
