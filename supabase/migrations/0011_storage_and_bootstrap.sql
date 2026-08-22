-- 0011_storage_and_bootstrap.sql
-- Storage bucket + production bootstrap.

-- ---------------------------------------------------------------------------
-- Storage  (§3.5)
--
-- storage.objects is SHARED with construction-saas and sms-demo. EVERY policy
-- below is scoped to bucket_id = 'pta-school-logos'. An unscoped policy here
-- would grant access to the other apps' files.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('pta-school-logos', 'pta-school-logos', true)
on conflict (id) do nothing;

drop policy if exists "pta_logos_public_read" on storage.objects;
create policy "pta_logos_public_read" on storage.objects for select
using (bucket_id = 'pta-school-logos');

-- Path convention: {school_id}/logo.{ext} — so the first path segment is the
-- tenant, and a school admin can only write inside their own folder.
drop policy if exists "pta_logos_admin_write" on storage.objects;
create policy "pta_logos_admin_write" on storage.objects for insert to authenticated
with check (
  bucket_id = 'pta-school-logos'
  and pta.has_school_role((storage.foldername(name))[1]::uuid, array['admin'])
);

drop policy if exists "pta_logos_admin_update" on storage.objects;
create policy "pta_logos_admin_update" on storage.objects for update to authenticated
using (
  bucket_id = 'pta-school-logos'
  and pta.has_school_role((storage.foldername(name))[1]::uuid, array['admin'])
)
with check (
  bucket_id = 'pta-school-logos'
  and pta.has_school_role((storage.foldername(name))[1]::uuid, array['admin'])
);

drop policy if exists "pta_logos_admin_delete" on storage.objects;
create policy "pta_logos_admin_delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'pta-school-logos'
  and pta.has_school_role((storage.foldername(name))[1]::uuid, array['admin'])
);

-- ---------------------------------------------------------------------------
-- Production bootstrap  (D24)
--
-- Exactly one row. auth_user_id stays null until the first real Google sign-in,
-- at which point pta.claim_invite() binds it by matching the email.
-- No demo data ever reaches the shared project.
-- ---------------------------------------------------------------------------

insert into pta.profiles (email, full_name, global_role)
values ('berlcamp@gmail.com', 'Berl Campomanes', 'super_admin')
on conflict (email) do update set global_role = 'super_admin';
