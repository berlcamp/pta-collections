-- 0031_invite_teacher_sections.sql — assign a teacher's sections when inviting.
--
-- 0030 assigned sections to an existing teacher account. But a teacher being
-- invited usually has no account yet (no profile until their first Google
-- sign-in), and section_teachers needs a profile. So the invite carries the
-- sections, and they are applied the moment the invite is accepted:
--
--   * already has a profile (common on this shared project):
--     invite_school_user() accepts at once, and invite_teacher() applies them
--     right after;
--   * signs in later: claim_invite() marks the invite accepted, and the
--     trigger below applies them then.
--
-- claim_invite() and invite_school_user() are NOT redefined — the trigger
-- hangs off the status change both of them already make.
--
-- Sections are filtered to the invite's own school at apply time, so a stale
-- or foreign id is dropped rather than raised: an invite that admits a teacher
-- must not fail at sign-in over a section deleted since.

alter table pta.school_user_invites
  add column if not exists section_ids uuid[];

-- The one place an invite's sections become assignments.
create or replace function pta.apply_invite_sections(p_invite_id uuid)
returns integer
language plpgsql
security definer
set search_path = pta, public
as $$
declare
  v_inv     pta.school_user_invites%rowtype;
  v_profile uuid;
  v_n       integer := 0;
begin
  select * into v_inv from pta.school_user_invites where id = p_invite_id;
  if not found or v_inv.status <> 'accepted' or v_inv.role <> 'teacher'
     or v_inv.section_ids is null or array_length(v_inv.section_ids, 1) is null then
    return 0;
  end if;

  select id into v_profile from pta.profiles where email = v_inv.email;
  if v_profile is null then
    return 0;
  end if;

  insert into pta.section_teachers (section_id, profile_id, school_id, created_by)
  select s.id, v_profile, v_inv.school_id, v_inv.invited_by
  from pta.sections s
  where s.id = any (v_inv.section_ids)
    and s.school_id = v_inv.school_id
  on conflict (section_id, profile_id) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function pta.apply_invite_sections(uuid) from public, anon, authenticated;

create or replace function pta.school_user_invites_apply_sections()
returns trigger
language plpgsql
security definer
set search_path = pta, public
as $$
begin
  perform pta.apply_invite_sections(new.id);
  return new;
end;
$$;

revoke execute on function pta.school_user_invites_apply_sections() from public, anon, authenticated;

create trigger school_user_invites_apply_sections
  after update of status on pta.school_user_invites
  for each row
  when (new.status = 'accepted' and old.status is distinct from 'accepted')
  execute function pta.school_user_invites_apply_sections();

-- Invite a teacher with their sections, in one call.
create or replace function pta.invite_teacher(
  p_school_id   uuid,
  p_email       text,
  p_full_name   text,
  p_section_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = pta, public
as $$
declare
  v_id uuid;
begin
  perform pta.require_school_role(p_school_id, array['admin']);

  if p_section_ids is not null and exists (
    select 1 from unnest(p_section_ids) sid
    where not exists (select 1 from pta.sections s where s.id = sid and s.school_id = p_school_id)
  ) then
    raise exception 'One or more sections are not in this school.' using errcode = '42501';
  end if;

  v_id := pta.invite_school_user(p_school_id, p_email, p_full_name, 'teacher');

  update pta.school_user_invites
     set section_ids = nullif(p_section_ids, '{}')
   where id = v_id;

  -- Accepted already when they held a profile; the trigger fired before the
  -- sections were on the row, so apply them now. A no-op for a pending invite.
  perform pta.apply_invite_sections(v_id);
  return v_id;
end;
$$;

revoke execute on function pta.invite_teacher(uuid, text, text, uuid[]) from public, anon;
grant  execute on function pta.invite_teacher(uuid, text, text, uuid[]) to authenticated;
