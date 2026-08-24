-- 0012_claim_invite_existing_user.sql
--
-- Fixes: an invitation is never applied to someone who already has a profile.
--
-- pta.claim_invite() as written in 0007 returned as soon as it found a profile
-- bound to auth.uid():
--
--     select * into v_profile from pta.profiles where auth_user_id = v_uid;
--     if found then
--       update ... ;
--       return v_profile;      -- <- never reads school_user_invites
--     end if;
--
-- So any account that already had a profile could not be added to a school.
-- Invite them, they sign in, and they get their existing profile back with no
-- membership attached; the invite stays 'pending' forever. proxy.ts only calls
-- claim_invite() when there is NO profile, so nothing else picked the invite up
-- either. The user then holds a profile with zero active memberships, which is
-- precisely the state that used to bounce them between /dashboard and
-- /no-access until the browser gave up with ERR_TOO_MANY_REDIRECTS.
--
-- This matters more on a shared Supabase project than it would elsewhere: an
-- invitee may already exist because of construction-saas or sms-demo, and a
-- staff member who moves between two PTA schools hits it every time.
--
-- The change: step 1 refreshes the display snapshot but no longer returns, so
-- control always reaches the invitation logic below. Step 2 is guarded so it
-- only looks for an unbound profile when step 1 did not already find one.
-- Everything else — the audit rows, the uninvited-returns-null contract, the
-- on-conflict membership upsert — is unchanged.

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

  -- 1. Already provisioned — refresh the display snapshot.
  --    Deliberately does NOT return: a provisioned user may still have a
  --    pending invitation to a school they are not yet a member of.
  select * into v_profile from pta.profiles where auth_user_id = v_uid;
  if found then
    update pta.profiles
       set full_name  = coalesce(nullif(v_name, ''), full_name),
           avatar_url = coalesce(v_avatar, avatar_url),
           email      = v_email
     where id = v_profile.id
     returning * into v_profile;
  end if;

  -- 2. No bound profile, but an unbound one exists for this email: the
  --    super-admin bootstrap row, or someone re-invited after their auth user
  --    was removed by another app on this project.
  if v_profile.id is null then
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
