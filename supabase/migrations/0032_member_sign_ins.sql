-- 0032_member_sign_ins.sql — when each staff member last signed in.
--
-- Administration → Users shows "Last signed in" beside every member. Supabase
-- keeps that on auth.users.last_sign_in_at, and auth.users is shared with the
-- other two apps on this project and readable by nobody here. So this is a
-- narrow SECURITY DEFINER read: admin of the school only, and only the
-- timestamp, only for that school's members. It touches nothing in auth —
-- a read, never a trigger or a write (see CLAUDE.md on auth.users).

create or replace function pta.school_member_sign_ins(p_school_id uuid)
returns table (profile_id uuid, last_sign_in_at timestamptz)
language plpgsql
stable
security definer
set search_path = pta, public
as $$
begin
  perform pta.require_school_role(p_school_id, array['admin']);

  return query
  select p.id, u.last_sign_in_at
  from pta.school_users su
  join pta.profiles p on p.id = su.profile_id
  join auth.users u   on u.id = p.auth_user_id
  where su.school_id = p_school_id;
end;
$$;

revoke execute on function pta.school_member_sign_ins(uuid) from public, anon;
grant  execute on function pta.school_member_sign_ins(uuid) to authenticated;
