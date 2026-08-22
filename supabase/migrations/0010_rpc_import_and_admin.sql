-- 0010_rpc_import_and_admin.sql
-- CSV import commit, school provisioning, invitations, storage bucket.

-- ---------------------------------------------------------------------------
-- pta.commit_import_batch  (D16)
--
-- Applies a fully-staged, fully-validated batch in ONE transaction, or applies
-- nothing. A matched student is NEVER modified unless the batch was explicitly
-- flagged update_enrollment, and even then only enrollment fields are touched —
-- never names, LRN, birth date, or anything financial.
-- ---------------------------------------------------------------------------

create or replace function pta.commit_import_batch(p_batch_id uuid)
returns table (
  created_students  integer,
  matched_students  integer,
  created_guardians integer,
  skipped_rows      integer
)
language plpgsql
security definer
set search_path = pta, public
as $$
declare
  v_batch        pta.student_import_batches;
  v_row          record;
  v_student_id   uuid;
  v_section_id   uuid;
  v_guardian_id  uuid;
  v_created_s    integer := 0;
  v_matched_s    integer := 0;
  v_created_g    integer := 0;
  v_skipped      integer := 0;
  v_profile      uuid := pta.current_profile_id();
  v_g            jsonb;
  v_gname        text;
  v_gcontact     text;
begin
  select * into v_batch from pta.student_import_batches where id = p_batch_id for update;
  if not found then
    raise exception 'Import batch % does not exist.', p_batch_id;
  end if;

  perform pta.require_school_role(v_batch.school_id, array['admin']);

  if v_batch.status = 'committed' then
    raise exception 'Import batch % has already been committed.', p_batch_id;
  end if;
  if v_batch.status not in ('uploaded', 'validated') then
    raise exception 'Import batch % is % and cannot be committed.', p_batch_id, v_batch.status;
  end if;

  for v_row in
    select * from pta.student_import_rows
    where batch_id = p_batch_id and status in ('valid', 'matched')
    order by row_number
  loop
    -- Resolve or create the section for this row's grade level.
    v_section_id := null;
    if nullif(trim(coalesce(v_row.normalized ->> 'section', '')), '') is not null then
      select id into v_section_id
      from pta.sections
      where school_id = v_batch.school_id
        and school_year_id = v_batch.school_year_id
        and grade_level = (v_row.normalized ->> 'grade_level')
        and name = (v_row.normalized ->> 'section');

      if v_section_id is null then
        insert into pta.sections (school_id, school_year_id, grade_level, name, created_by)
        values (v_batch.school_id, v_batch.school_year_id,
                v_row.normalized ->> 'grade_level', v_row.normalized ->> 'section', v_profile)
        on conflict (school_id, school_year_id, grade_level, name) do nothing
        returning id into v_section_id;

        if v_section_id is null then
          select id into v_section_id from pta.sections
          where school_id = v_batch.school_id
            and school_year_id = v_batch.school_year_id
            and grade_level = (v_row.normalized ->> 'grade_level')
            and name = (v_row.normalized ->> 'section');
        end if;
      end if;
    end if;

    if v_row.status = 'matched' then
      v_student_id := v_row.matched_student_id;
      v_matched_s := v_matched_s + 1;

      -- D16: matched students are left alone by default. The only permitted
      -- write is the explicitly opted-in enrollment update, and it touches
      -- nothing but grade level and section.
      if v_batch.update_enrollment then
        update pta.student_enrollments
           set grade_level = v_row.normalized ->> 'grade_level',
               section_id  = coalesce(v_section_id, section_id)
         where student_id = v_student_id
           and school_year_id = v_batch.school_year_id;

        if not found then
          insert into pta.student_enrollments (
            school_id, student_id, school_year_id, section_id,
            grade_level, student_number, status, created_by
          ) values (
            v_batch.school_id, v_student_id, v_batch.school_year_id, v_section_id,
            v_row.normalized ->> 'grade_level',
            nullif(v_row.normalized ->> 'student_number', ''), 'enrolled', v_profile
          );
        end if;
      else
        -- Still ensure an enrollment exists for THIS year, otherwise a returning
        -- student can never be charged (the composite FK in D10 would reject it).
        insert into pta.student_enrollments (
          school_id, student_id, school_year_id, section_id,
          grade_level, student_number, status, created_by
        ) values (
          v_batch.school_id, v_student_id, v_batch.school_year_id, v_section_id,
          v_row.normalized ->> 'grade_level',
          nullif(v_row.normalized ->> 'student_number', ''), 'enrolled', v_profile
        )
        on conflict (student_id, school_year_id) do nothing;
      end if;
    else
      insert into pta.students (
        school_id, lrn, first_name, middle_name, last_name, suffix,
        birth_date, sex, status, created_by
      ) values (
        v_batch.school_id,
        nullif(v_row.normalized ->> 'lrn', ''),
        v_row.normalized ->> 'first_name',
        nullif(v_row.normalized ->> 'middle_name', ''),
        v_row.normalized ->> 'last_name',
        nullif(v_row.normalized ->> 'suffix', ''),
        (nullif(v_row.normalized ->> 'birth_date', ''))::date,
        nullif(v_row.normalized ->> 'sex', ''),
        'active', v_profile
      )
      returning id into v_student_id;

      v_created_s := v_created_s + 1;

      insert into pta.student_enrollments (
        school_id, student_id, school_year_id, section_id,
        grade_level, student_number, status, created_by
      ) values (
        v_batch.school_id, v_student_id, v_batch.school_year_id, v_section_id,
        v_row.normalized ->> 'grade_level',
        nullif(v_row.normalized ->> 'student_number', ''), 'enrolled', v_profile
      );
    end if;

    -- Guardians. Matched on (school, normalized name, normalized contact) and
    -- reused across siblings rather than duplicated.
    for v_g in select * from jsonb_array_elements(coalesce(v_row.normalized -> 'guardians', '[]'::jsonb))
    loop
      v_gname := nullif(trim(coalesce(v_g ->> 'name', '')), '');
      continue when v_gname is null;

      v_gcontact := pta.normalize_contact(v_g ->> 'contact');

      select id into v_guardian_id
      from pta.parents_guardians
      where school_id = v_batch.school_id
        and pta.normalize_name(first_name || ' ' || last_name) = pta.normalize_name(v_gname)
        and coalesce(pta.normalize_contact(contact_number), '') = coalesce(v_gcontact, '')
      limit 1;

      if v_guardian_id is null then
        insert into pta.parents_guardians (
          school_id, first_name, last_name, contact_number, created_by
        ) values (
          v_batch.school_id,
          split_part(v_gname, ' ', 1),
          nullif(trim(substring(v_gname from position(' ' in v_gname) + 1)), ''),
          v_gcontact, v_profile
        )
        returning id into v_guardian_id;
        v_created_g := v_created_g + 1;
      end if;

      insert into pta.student_guardians (
        school_id, student_id, guardian_id, relationship, is_primary
      ) values (
        v_batch.school_id, v_student_id, v_guardian_id,
        coalesce(nullif(v_g ->> 'relationship', ''), 'Guardian'),
        coalesce((v_g ->> 'is_primary')::boolean, false)
          and not exists (select 1 from pta.student_guardians sg
                          where sg.student_id = v_student_id and sg.is_primary)
      )
      on conflict (student_id, guardian_id) do nothing;
    end loop;
  end loop;

  select count(*)::integer into v_skipped
  from pta.student_import_rows
  where batch_id = p_batch_id and status in ('error', 'duplicate');

  update pta.student_import_batches
     set status = 'committed',
         created_students = v_created_s,
         created_guardians = v_created_g,
         matched_rows = v_matched_s
   where id = p_batch_id;

  perform pta.write_audit(
    v_batch.school_id, 'IMPORT_COMMITTED', 'student_import_batch', p_batch_id, null,
    jsonb_build_object('filename', v_batch.filename,
                       'created_students', v_created_s,
                       'matched_students', v_matched_s,
                       'created_guardians', v_created_g,
                       'skipped_rows', v_skipped)
  );

  created_students := v_created_s;
  matched_students := v_matched_s;
  created_guardians := v_created_g;
  skipped_rows := v_skipped;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- Super Admin: school provisioning
-- ---------------------------------------------------------------------------

create or replace function pta.create_school(
  p_school_code    text,
  p_name           text,
  p_receipt_prefix text,
  p_short_name     text default null,
  p_address        text default null,
  p_city           text default null,
  p_province       text default null,
  p_region         text default null,
  p_contact_number text default null,
  p_email          text default null
)
returns uuid
language plpgsql
security definer
set search_path = pta, public
as $$
declare
  v_id uuid;
begin
  if not pta.is_super_admin() then
    raise exception 'Only a Super Admin can create schools.' using errcode = '42501';
  end if;

  insert into pta.schools (
    school_code, name, short_name, address, city, province, region,
    contact_number, email, receipt_prefix, created_by
  ) values (
    upper(trim(p_school_code)), trim(p_name), p_short_name, p_address, p_city, p_province,
    p_region, p_contact_number, lower(nullif(trim(coalesce(p_email, '')), '')),
    upper(trim(p_receipt_prefix)), pta.current_profile_id()
  )
  returning id into v_id;

  perform pta.write_audit(v_id, 'SCHOOL_CREATED', 'school', v_id, null,
                          jsonb_build_object('name', p_name, 'code', p_school_code));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Invitations  (the only way in — D4)
-- ---------------------------------------------------------------------------

create or replace function pta.invite_school_user(
  p_school_id uuid,
  p_email     text,
  p_full_name text,
  p_role      text
)
returns uuid
language plpgsql
security definer
set search_path = pta, public
as $$
declare
  v_id    uuid;
  v_email text := lower(trim(p_email));
begin
  -- Only a super admin may mint school administrators; a school admin may invite
  -- the operational roles inside their own school.
  if p_role = 'admin' then
    if not pta.is_super_admin() and not pta.has_school_role(p_school_id, array['admin']) then
      raise exception 'Not authorized to invite an administrator.' using errcode = '42501';
    end if;
  else
    perform pta.require_school_role(p_school_id, array['admin']);
  end if;

  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Invalid email address: %', p_email;
  end if;
  if p_role not in ('admin', 'cashier', 'treasurer', 'viewer') then
    raise exception 'Invalid role: %', p_role;
  end if;

  -- Supersede any previous pending invite for this address at this school.
  update pta.school_user_invites
     set status = 'revoked'
   where school_id = p_school_id and email = v_email and status = 'pending';

  insert into pta.school_user_invites (school_id, email, full_name, role, invited_by)
  values (p_school_id, v_email, trim(p_full_name), p_role, pta.current_profile_id())
  returning id into v_id;

  -- If they already have a profile (common on this shared project), apply the
  -- membership immediately rather than making them sign out and back in.
  declare
    v_existing uuid;
  begin
    select id into v_existing from pta.profiles where email = v_email;
    if found then
      insert into pta.school_users (school_id, profile_id, role, status, created_by)
      values (p_school_id, v_existing, p_role, 'active', pta.current_profile_id())
      on conflict (school_id, profile_id) do update
        set role = excluded.role, status = 'active';
      update pta.school_user_invites set status = 'accepted' where id = v_id;
    end if;
  end;

  perform pta.write_audit(p_school_id, 'USER_INVITED', 'school_user_invite', v_id, null,
                          jsonb_build_object('email', v_email, 'role', p_role));
  return v_id;
end;
$$;

create or replace function pta.set_school_user_status(p_school_user_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = pta, public
as $$
declare
  v_su pta.school_users;
begin
  select * into v_su from pta.school_users where id = p_school_user_id;
  if not found then
    raise exception 'Membership % does not exist.', p_school_user_id;
  end if;

  perform pta.require_school_role(v_su.school_id, array['admin']);

  if p_status not in ('active', 'inactive') then
    raise exception 'Invalid status: %', p_status;
  end if;

  update pta.school_users set status = p_status where id = p_school_user_id;

  perform pta.write_audit(v_su.school_id, 'USER_STATUS_CHANGED', 'school_user', p_school_user_id,
                          jsonb_build_object('status', v_su.status),
                          jsonb_build_object('status', p_status));
end;
$$;

revoke execute on function pta.commit_import_batch(uuid) from public;
revoke execute on function pta.create_school(text, text, text, text, text, text, text, text, text, text) from public;
revoke execute on function pta.invite_school_user(uuid, text, text, text) from public;
revoke execute on function pta.set_school_user_status(uuid, text) from public;

grant execute on function pta.commit_import_batch(uuid) to authenticated;
grant execute on function pta.create_school(text, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function pta.invite_school_user(uuid, text, text, text) to authenticated;
grant execute on function pta.set_school_user_status(uuid, text) to authenticated;
