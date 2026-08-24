-- demo_mvts_teardown.sql — removes everything demo_mvts_seed.sql created.
--
-- Run by hand in the Supabase SQL Editor, as a single statement. One
-- transaction: it either removes all of the demo data or none of it.
--
-- SCOPE. Two things and nothing else:
--   1. every row belonging to the school whose school_code is 'MVTS'
--   2. the four demo staff profiles at @mvts.demo
--
-- It never touches the super-admin profile, another school, `public`, or
-- `auth.users`. If MVTS is not present it reports that and exits cleanly, so
-- the script is safe to run twice.
--
-- ORDER MATTERS. payments, payment_items and student_charges hold their school
-- with ON DELETE RESTRICT, so `delete from pta.schools` on its own fails. The
-- deletes below run children-first. pta.school_years additionally carries a
-- BEFORE DELETE trigger that refuses every delete (financial history depends on
-- school years); it is disabled for the one statement that needs it and
-- re-enabled immediately, inside the same transaction.

do $$
declare
  -- Set to true only if you have read the refusal message below and accept
  -- that real users will lose their access to MVTS.
  v_force    constant boolean := false;

  v_school   uuid;
  v_real     text;
  v_students int;
  v_payments int;
  v_charges  int;
  v_staff    int;
begin
  select id into v_school from pta.schools where school_code = 'MVTS';

  if v_school is null then
    raise notice 'No school with school_code MVTS. Nothing to remove.';
    return;
  end if;

  -- ── Refuse to strip access from real people ──────────────────────────────
  --
  -- Deleting the school necessarily deletes its pta.school_users rows. A real
  -- person's profile survives that deletion with zero active memberships, which
  -- locks them out of the app entirely — there is no self-service way back in,
  -- because an invitation cannot re-admit someone who already has a profile
  -- unless migration 0012 has been applied.
  --
  -- The demo staff this script created are identifiable by their @mvts.demo
  -- addresses. Anyone else holding a membership in MVTS was added on purpose,
  -- so stop and name them rather than quietly revoking them.
  select string_agg(p.email, ', ' order by p.email) into v_real
  from pta.school_users su
  join pta.profiles p on p.id = su.profile_id
  where su.school_id = v_school
    and p.email not like '%@mvts.demo';

  if v_real is not null and not v_force then
    raise exception using
      message = 'Refusing to run: these real users are members of MVTS and would lose access — ' || v_real,
      hint    = 'Remove them from MVTS first, or re-add them afterwards with an insert into '
                || 'pta.school_users. If you accept the loss, set v_force := true at the top '
                || 'of this script.';
  end if;

  if v_real is not null then
    raise warning 'v_force is set: revoking MVTS access for %', v_real;
  end if;

  select count(*) into v_students from pta.students        where school_id = v_school;
  select count(*) into v_payments from pta.payments        where school_id = v_school;
  select count(*) into v_charges  from pta.student_charges where school_id = v_school;

  -- Money first — these are the ON DELETE RESTRICT rows.
  delete from pta.payment_items  where school_id = v_school;
  delete from pta.payments       where school_id = v_school;
  delete from pta.student_charges where school_id = v_school;

  -- Import staging (none in the seed, but a demo run may have created some).
  delete from pta.student_import_rows    where school_id = v_school;
  delete from pta.student_import_batches where school_id = v_school;

  -- People.
  delete from pta.student_guardians  where school_id = v_school;
  delete from pta.parents_guardians  where school_id = v_school;
  delete from pta.student_enrollments where school_id = v_school;
  delete from pta.students           where school_id = v_school;

  -- Academic structure and configuration.
  delete from pta.sections          where school_id = v_school;
  delete from pta.receipt_counters  where school_id = v_school;
  delete from pta.fee_types         where school_id = v_school;
  delete from pta.school_settings   where school_id = v_school;

  -- Membership and the audit trail for this school. Audit rows with a NULL
  -- school_id are left alone: those belong to the platform, not to MVTS.
  delete from pta.school_user_invites where school_id = v_school;
  delete from pta.school_users        where school_id = v_school;
  delete from pta.audit_logs          where school_id = v_school;

  -- School years refuse deletion by design. Lift the guard for this one
  -- statement only; the ALTERs and the DELETE are in the same transaction, so
  -- the trigger is never off for any other session's work.
  alter table pta.school_years disable trigger school_years_no_delete;
  delete from pta.school_years where school_id = v_school;
  alter table pta.school_years enable trigger school_years_no_delete;

  delete from pta.schools where id = v_school;

  -- The demo staff. Identified by the @mvts.demo domain, which nothing else
  -- uses. The super admin is not in this set.
  delete from pta.profiles where email like '%@mvts.demo';
  get diagnostics v_staff = row_count;

  raise notice '─────────────────────────────────────────────';
  raise notice 'MVTS demo data removed.';
  raise notice '  school_id  %', v_school;
  raise notice '  students   %', v_students;
  raise notice '  charges    %', v_charges;
  raise notice '  payments   %', v_payments;
  raise notice '  staff      %', v_staff;
  raise notice '─────────────────────────────────────────────';
end $$;
