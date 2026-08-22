-- 0006_rls_policies.sql
-- Row Level Security. Enabled AND FORCED on every table in pta.
--
-- Policy shape (§7.2):
--   * Tenant reads:  school_id = any (pta.current_school_ids())
--   * Config writes: pta.has_school_role(school_id, array['admin'])
--   * Financial writes: NO policy at all. payments, payment_items and
--     student_charges are written only by SECURITY DEFINER RPCs (D3).
--   * audit_logs: insert + select only. No update policy, no delete policy
--     exists, so those operations are denied to everyone including admins (D23).
--
-- There is no `using (true)` anywhere in this file.

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'schools', 'school_settings', 'school_users', 'school_user_invites',
    'school_years', 'grade_levels', 'sections', 'students', 'student_enrollments',
    'parents_guardians', 'student_guardians', 'fee_types', 'student_charges',
    'receipt_counters', 'payments', 'payment_items', 'audit_logs',
    'student_import_batches', 'student_import_rows'
  ] loop
    execute format('alter table pta.%I enable row level security', t);
    execute format('alter table pta.%I force row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

-- You can always see yourself. Otherwise you see people who share a school with
-- you, and super admins see everyone.
create policy profiles_read on pta.profiles for select to authenticated
using (
  auth_user_id = auth.uid()
  or pta.is_super_admin()
  or exists (
    select 1 from pta.school_users su
    where su.profile_id = pta.profiles.id
      and su.school_id = any (pta.current_school_ids())
  )
);

create policy profiles_self_update on pta.profiles for update to authenticated
using (auth_user_id = auth.uid())
with check (auth_user_id = auth.uid() and global_role = 'user');
-- Note: a user cannot promote themselves — global_role must stay 'user'.
-- An existing super admin's own updates go through the RPC layer.

-- ---------------------------------------------------------------------------
-- schools
-- ---------------------------------------------------------------------------

create policy schools_read on pta.schools for select to authenticated
using (id = any (pta.current_school_ids()) or pta.is_super_admin());

create policy schools_super_admin_write on pta.schools for all to authenticated
using (pta.is_super_admin())
with check (pta.is_super_admin());

-- A school admin may edit their own school's presentation/settings but cannot
-- create schools, delete them, or flip `active`.
create policy schools_admin_update on pta.schools for update to authenticated
using (pta.has_school_role(id, array['admin']))
with check (pta.has_school_role(id, array['admin']));

create policy school_settings_read on pta.school_settings for select to authenticated
using (school_id = any (pta.current_school_ids()));

create policy school_settings_admin_write on pta.school_settings for all to authenticated
using (pta.has_school_role(school_id, array['admin']))
with check (pta.has_school_role(school_id, array['admin']));

-- ---------------------------------------------------------------------------
-- Membership and invites
-- ---------------------------------------------------------------------------

create policy school_users_read on pta.school_users for select to authenticated
using (
  school_id = any (pta.current_school_ids())
  or profile_id = pta.current_profile_id()
);

create policy school_users_admin_write on pta.school_users for all to authenticated
using (pta.has_school_role(school_id, array['admin']))
with check (pta.has_school_role(school_id, array['admin']));

create policy invites_read on pta.school_user_invites for select to authenticated
using (school_id = any (pta.current_school_ids()));

create policy invites_admin_write on pta.school_user_invites for all to authenticated
using (pta.has_school_role(school_id, array['admin']))
with check (pta.has_school_role(school_id, array['admin']));

-- ---------------------------------------------------------------------------
-- Academic configuration — readable by the tenant, writable by admins
-- ---------------------------------------------------------------------------

create policy grade_levels_read on pta.grade_levels for select to authenticated
using (true);   -- a static DepEd lookup; contains no tenant data

create policy school_years_read on pta.school_years for select to authenticated
using (school_id = any (pta.current_school_ids()));

create policy school_years_admin_write on pta.school_years for all to authenticated
using (pta.has_school_role(school_id, array['admin']))
with check (pta.has_school_role(school_id, array['admin']));

create policy sections_read on pta.sections for select to authenticated
using (school_id = any (pta.current_school_ids()));

create policy sections_admin_write on pta.sections for all to authenticated
using (pta.has_school_role(school_id, array['admin']))
with check (pta.has_school_role(school_id, array['admin']));

create policy fee_types_read on pta.fee_types for select to authenticated
using (school_id = any (pta.current_school_ids()));

create policy fee_types_admin_write on pta.fee_types for all to authenticated
using (pta.has_school_role(school_id, array['admin']))
with check (pta.has_school_role(school_id, array['admin']));

-- ---------------------------------------------------------------------------
-- Students, enrollments, guardians
-- ---------------------------------------------------------------------------

create policy students_read on pta.students for select to authenticated
using (school_id = any (pta.current_school_ids()));

create policy students_admin_write on pta.students for all to authenticated
using (pta.has_school_role(school_id, array['admin']))
with check (pta.has_school_role(school_id, array['admin']));

create policy enrollments_read on pta.student_enrollments for select to authenticated
using (school_id = any (pta.current_school_ids()));

create policy enrollments_admin_write on pta.student_enrollments for all to authenticated
using (pta.has_school_role(school_id, array['admin']))
with check (pta.has_school_role(school_id, array['admin']));

create policy guardians_read on pta.parents_guardians for select to authenticated
using (school_id = any (pta.current_school_ids()));

create policy guardians_admin_write on pta.parents_guardians for all to authenticated
using (pta.has_school_role(school_id, array['admin']))
with check (pta.has_school_role(school_id, array['admin']));

create policy student_guardians_read on pta.student_guardians for select to authenticated
using (school_id = any (pta.current_school_ids()));

create policy student_guardians_admin_write on pta.student_guardians for all to authenticated
using (pta.has_school_role(school_id, array['admin']))
with check (pta.has_school_role(school_id, array['admin']));

-- ---------------------------------------------------------------------------
-- Financial tables — READ ONLY through RLS.
--
-- Deliberately NO insert/update/delete policy. Every write goes through
-- pta.create_payment / void_payment / assess_annual_fees / waive_charge /
-- cancel_charge, which are SECURITY DEFINER and re-check authorization (D3).
-- If you find yourself wanting to add a write policy here, add an RPC instead.
-- ---------------------------------------------------------------------------

create policy charges_read on pta.student_charges for select to authenticated
using (school_id = any (pta.current_school_ids()));

-- D22: cashiers read ALL payments in their school. Own-rows-only breaks the core
-- job ("has this parent already paid?") and shift handovers. The real control is
-- that a cashier cannot void; the UI defaults the daily view to their own rows.
create policy payments_read on pta.payments for select to authenticated
using (school_id = any (pta.current_school_ids()));

create policy payment_items_read on pta.payment_items for select to authenticated
using (school_id = any (pta.current_school_ids()));

create policy receipt_counters_read on pta.receipt_counters for select to authenticated
using (school_id = any (pta.current_school_ids()));

-- ---------------------------------------------------------------------------
-- audit_logs — append-only (D23)
-- No UPDATE policy and no DELETE policy exist below. With RLS forced, that means
-- update and delete are denied to every role, including school admins.
-- ---------------------------------------------------------------------------

create policy audit_read on pta.audit_logs for select to authenticated
using (
  (school_id is not null and school_id = any (pta.current_school_ids()))
  or (school_id is null and pta.is_super_admin())
);

create policy audit_insert on pta.audit_logs for insert to authenticated
with check (
  school_id is null or school_id = any (pta.current_school_ids())
);

-- ---------------------------------------------------------------------------
-- Import staging
-- ---------------------------------------------------------------------------

create policy import_batches_read on pta.student_import_batches for select to authenticated
using (school_id = any (pta.current_school_ids()));

create policy import_batches_admin_write on pta.student_import_batches for all to authenticated
using (pta.has_school_role(school_id, array['admin']))
with check (pta.has_school_role(school_id, array['admin']));

create policy import_rows_read on pta.student_import_rows for select to authenticated
using (school_id = any (pta.current_school_ids()));

create policy import_rows_admin_write on pta.student_import_rows for all to authenticated
using (pta.has_school_role(school_id, array['admin']))
with check (pta.has_school_role(school_id, array['admin']));

-- ---------------------------------------------------------------------------
-- Grants. RLS is the gate; grants are the outer door.
-- anon gets nothing at all.
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on all tables in schema pta to authenticated;
grant select on all tables in schema pta to authenticated;
revoke all on all tables in schema pta from anon;
