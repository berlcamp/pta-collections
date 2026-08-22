-- 0005_rls_helpers.sql
-- Authorization helpers.  (D12)
--
-- These are SECURITY DEFINER precisely so that a policy ON pta.school_users can
-- call them WITHOUT recursing into school_users' own RLS. A plain subquery there
-- deadlocks into infinite recursion.
--
-- They are STABLE, so Postgres caches them per-statement — and, crucially, they
-- are NOT JWT claims. Deactivating a cashier takes effect on their very next
-- query, not when their token expires an hour later. That is cross-tenant test #10.

-- ---------------------------------------------------------------------------

create or replace function pta.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = pta, public
as $$
  select id from pta.profiles where auth_user_id = auth.uid();
$$;

create or replace function pta.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = pta, public
as $$
  select coalesce(
    (select global_role = 'super_admin'
     from pta.profiles
     where auth_user_id = auth.uid()),
    false
  );
$$;

-- The set of schools the caller may touch.
-- Super admin: every ACTIVE school. Otherwise: schools where they hold an ACTIVE
-- membership AND the school itself is active. Both deactivation paths (D25/§7.1)
-- funnel through here.
create or replace function pta.current_school_ids()
returns uuid[]
language sql
stable
security definer
set search_path = pta, public
as $$
  select coalesce(
    case
      when pta.is_super_admin() then
        (select array_agg(s.id) from pta.schools s where s.active)
      else
        (select array_agg(su.school_id)
         from pta.school_users su
         join pta.schools s on s.id = su.school_id
         where su.profile_id = pta.current_profile_id()
           and su.status = 'active'
           and s.active)
    end,
    '{}'::uuid[]
  );
$$;

create or replace function pta.has_school_role(p_school_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = pta, public
as $$
  select case
    when p_school_id is null then false
    when pta.is_super_admin() then
      exists (select 1 from pta.schools s where s.id = p_school_id and s.active)
    else exists (
      select 1
      from pta.school_users su
      join pta.schools s on s.id = su.school_id
      where su.school_id = p_school_id
        and su.profile_id = pta.current_profile_id()
        and su.status = 'active'
        and su.role = any (p_roles)
        and s.active
    )
  end;
$$;

-- Convenience wrapper used by RPCs: raise a clean error instead of returning false.
create or replace function pta.require_school_role(p_school_id uuid, p_roles text[])
returns void
language plpgsql
stable
security definer
set search_path = pta, public
as $$
begin
  if not pta.has_school_role(p_school_id, p_roles) then
    raise exception 'Not authorized: requires one of % in this school.', array_to_string(p_roles, ', ')
      using errcode = '42501';
  end if;
end;
$$;

-- True when the caller is operating as super admin WITHOUT an explicit membership.
-- Stamped onto payments and audit rows so a super-admin action inside a school is
-- always identifiable afterwards (D2 — the switcher is accountable, not enforcing).
create or replace function pta.acting_as_super_admin(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pta, public
as $$
  select pta.is_super_admin()
     and not exists (
       select 1 from pta.school_users su
       where su.school_id = p_school_id
         and su.profile_id = pta.current_profile_id()
         and su.status = 'active'
     );
$$;

-- Append-only audit writer. Called from inside the RPCs (D23) — never a trigger,
-- because only the RPC knows intent (VOID_PAYMENT + reason) and the acting context.
create or replace function pta.write_audit(
  p_school_id   uuid,
  p_action      text,
  p_entity_type text,
  p_entity_id   uuid,
  p_old_values  jsonb default null,
  p_new_values  jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = pta, public
as $$
declare
  v_id uuid;
begin
  insert into pta.audit_logs (
    school_id, profile_id, action, entity_type, entity_id,
    old_values, new_values, acting_as_super_admin
  ) values (
    p_school_id, pta.current_profile_id(), p_action, p_entity_type, p_entity_id,
    p_old_values, p_new_values, pta.acting_as_super_admin(p_school_id)
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Lock these down: definer functions must not be callable by anon.
revoke execute on function pta.current_profile_id()                from public;
revoke execute on function pta.is_super_admin()                    from public;
revoke execute on function pta.current_school_ids()                from public;
revoke execute on function pta.has_school_role(uuid, text[])       from public;
revoke execute on function pta.require_school_role(uuid, text[])   from public;
revoke execute on function pta.acting_as_super_admin(uuid)         from public;
revoke execute on function pta.write_audit(uuid, text, text, uuid, jsonb, jsonb) from public;

grant execute on function pta.current_profile_id()              to authenticated;
grant execute on function pta.is_super_admin()                  to authenticated;
grant execute on function pta.current_school_ids()              to authenticated;
grant execute on function pta.has_school_role(uuid, text[])     to authenticated;
grant execute on function pta.acting_as_super_admin(uuid)       to authenticated;
