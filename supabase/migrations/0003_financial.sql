-- 0003_financial.sql
-- Fee types, charges, payments, receipt counters, audit log, import staging.
--
-- All money is numeric(12,2). Never float.
-- D10: charges and payments key on (student_id, school_year_id) with a composite
--      FK to student_enrollments, so a charge cannot exist for a year the student
--      is not enrolled in.
-- D13: overpayment is rejected in the database (see pta.create_payment).
-- D15: there is NO stored paid/partially_paid/unpaid column. `status` holds only
--      human-set states. Payment status is derived in v_student_charge_balances.

-- ---------------------------------------------------------------------------
-- fee_types
-- ---------------------------------------------------------------------------

create table pta.fee_types (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references pta.schools(id) on delete cascade,
  name           text not null,
  description    text,
  category       text not null check (category in ('annual', 'penalty', 'special', 'other')),
  default_amount numeric(12,2) check (default_amount is null or default_amount >= 0),
  is_recurring   boolean not null default false,
  active         boolean not null default true,
  created_by     uuid references pta.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (school_id, name)
);

create index fee_types_school_idx on pta.fee_types (school_id, active);

create trigger fee_types_set_updated_at
  before update on pta.fee_types
  for each row execute function pta.set_updated_at();

-- ---------------------------------------------------------------------------
-- student_charges
-- ---------------------------------------------------------------------------

create table pta.student_charges (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references pta.schools(id) on delete cascade,
  student_id     uuid not null references pta.students(id) on delete restrict,
  school_year_id uuid not null references pta.school_years(id),
  fee_type_id    uuid not null references pta.fee_types(id) on delete restrict,
  description    text,
  amount         numeric(12,2) not null check (amount > 0),
  -- D15: partial waivers are real (a second sibling paying half the PTA fee).
  waived_amount  numeric(12,2) not null default 0
                   check (waived_amount >= 0),
  due_date       date,
  -- D15: human-set states ONLY. Never paid/partially_paid/unpaid.
  status         text not null default 'active'
                   check (status in ('active', 'waived', 'cancelled')),
  status_reason  text,
  created_by     uuid references pta.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint student_charges_waived_within_amount check (waived_amount <= amount),
  constraint student_charges_reason_required
    check (status = 'active' or (status_reason is not null and length(trim(status_reason)) > 0)),
  -- D10: composite FK — the enrollment must exist.
  constraint student_charges_enrollment_fk
    foreign key (student_id, school_year_id)
    references pta.student_enrollments (student_id, school_year_id)
    on delete restrict
);

-- Idempotent annual assessment: one live charge per (student, year, fee type).
-- pta.assess_annual_fees relies on this for `on conflict do nothing`.
create unique index student_charges_no_duplicate_assessment_idx
  on pta.student_charges (student_id, school_year_id, fee_type_id)
  where status <> 'cancelled';

create index student_charges_lookup_idx
  on pta.student_charges (school_id, student_id, school_year_id);
create index student_charges_year_idx on pta.student_charges (school_id, school_year_id, status);
create index student_charges_fee_type_idx on pta.student_charges (fee_type_id);

create trigger student_charges_set_updated_at
  before update on pta.student_charges
  for each row execute function pta.set_updated_at();

-- ---------------------------------------------------------------------------
-- receipt_counters  (D18)
--
-- One row per (school, school_year). pta.create_payment takes it FOR UPDATE.
-- Gaps ARE expected: a rolled-back transaction burns a number, and a receipt
-- number is never reused after a void. Do not "fix" the gaps.
-- ---------------------------------------------------------------------------

create table pta.receipt_counters (
  school_id      uuid not null references pta.schools(id) on delete cascade,
  school_year_id uuid not null references pta.school_years(id) on delete cascade,
  next_seq       integer not null default 1 check (next_seq > 0),
  primary key (school_id, school_year_id)
);

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------

create table pta.payments (
  id                    uuid primary key default gen_random_uuid(),
  school_id             uuid not null references pta.schools(id) on delete restrict,
  receipt_number        text not null,
  student_id            uuid not null references pta.students(id) on delete restrict,
  school_year_id        uuid not null references pta.school_years(id),
  payment_date          timestamptz not null default now(),
  -- Always equals sum(payment_items.amount). Enforced by a deferred constraint
  -- trigger below; never taken from the client (D13).
  total_amount          numeric(12,2) not null check (total_amount > 0),
  -- Cash only. Display-only: creates no balance and no credit (D13).
  amount_tendered       numeric(12,2) check (amount_tendered is null or amount_tendered >= 0),
  change_amount         numeric(12,2) check (change_amount is null or change_amount >= 0),
  payment_method        text not null
                          check (payment_method in ('cash', 'gcash', 'bank_transfer', 'other')),
  reference_number      text,
  remarks               text,
  collected_by          uuid not null references pta.profiles(id) on delete restrict,
  status                text not null default 'posted' check (status in ('posted', 'voided')),
  voided_at             timestamptz,
  voided_by             uuid references pta.profiles(id),
  void_reason           text,
  acting_as_super_admin boolean not null default false,
  idempotency_key       text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- D18: school-scoped uniqueness. Two schools may both have -000001.
  unique (school_id, receipt_number),
  -- D14: a void always carries who, when and why.
  constraint payments_void_fields check (
    status = 'posted' or (
      voided_at is not null and voided_by is not null
      and void_reason is not null and length(trim(void_reason)) > 0
    )
  ),
  constraint payments_change_requires_tender check (
    change_amount is null or amount_tendered is not null
  ),
  constraint payments_enrollment_fk
    foreign key (student_id, school_year_id)
    references pta.student_enrollments (student_id, school_year_id)
    on delete restrict
);

-- Guards against a double-submitted payment form creating two payments.
create unique index payments_idempotency_idx
  on pta.payments (school_id, idempotency_key)
  where idempotency_key is not null;

create index payments_school_date_idx on pta.payments (school_id, payment_date desc);
create index payments_cashier_idx on pta.payments (school_id, collected_by, payment_date desc);
create index payments_student_idx on pta.payments (student_id, school_year_id);
create index payments_receipt_idx on pta.payments (school_id, receipt_number);
create index payments_status_idx on pta.payments (school_id, status);
create index payments_reference_trgm_idx on pta.payments
  using gin (coalesce(reference_number, '') gin_trgm_ops);

create trigger payments_set_updated_at
  before update on pta.payments
  for each row execute function pta.set_updated_at();

-- ---------------------------------------------------------------------------
-- payment_items
-- ---------------------------------------------------------------------------

create table pta.payment_items (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references pta.schools(id) on delete restrict,
  payment_id        uuid not null references pta.payments(id) on delete restrict,
  student_charge_id uuid not null references pta.student_charges(id) on delete restrict,
  amount            numeric(12,2) not null check (amount > 0),
  created_at        timestamptz not null default now(),
  unique (payment_id, student_charge_id)
);

create index payment_items_charge_idx on pta.payment_items (student_charge_id);
create index payment_items_payment_idx on pta.payment_items (payment_id);

-- payments.total_amount must always equal sum(payment_items.amount).
-- DEFERRED so create_payment can insert the payment before its items.
create or replace function pta.assert_payment_total_matches_items()
returns trigger
language plpgsql
as $$
declare
  v_payment_id uuid := coalesce(new.payment_id, old.payment_id);
  v_total      numeric(12,2);
  v_items      numeric(12,2);
begin
  select total_amount into v_total from pta.payments where id = v_payment_id;
  if v_total is null then
    return null;  -- payment row is gone; nothing to assert
  end if;

  select coalesce(sum(amount), 0) into v_items
  from pta.payment_items where payment_id = v_payment_id;

  if v_total <> v_items then
    raise exception
      'Payment total (%) does not match the sum of its items (%). Payment %.',
      v_total, v_items, v_payment_id;
  end if;
  return null;
end;
$$;

create constraint trigger payment_items_total_check
  after insert or update or delete on pta.payment_items
  deferrable initially deferred
  for each row execute function pta.assert_payment_total_matches_items();

-- ---------------------------------------------------------------------------
-- audit_logs  (D23: append-only; written inside the RPCs, not by triggers)
-- ---------------------------------------------------------------------------

create table pta.audit_logs (
  id                    uuid primary key default gen_random_uuid(),
  school_id             uuid references pta.schools(id) on delete set null,
  profile_id            uuid references pta.profiles(id) on delete set null,
  action                text not null,
  entity_type           text not null,
  entity_id             uuid,
  old_values            jsonb,
  new_values            jsonb,
  acting_as_super_admin boolean not null default false,
  created_at            timestamptz not null default now()
);

create index audit_logs_school_idx on pta.audit_logs (school_id, created_at desc);
create index audit_logs_entity_idx on pta.audit_logs (entity_type, entity_id);
create index audit_logs_profile_idx on pta.audit_logs (profile_id, created_at desc);

-- ---------------------------------------------------------------------------
-- CSV import staging  (D16)
-- ---------------------------------------------------------------------------

create table pta.student_import_batches (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references pta.schools(id) on delete cascade,
  school_year_id    uuid not null references pta.school_years(id),
  filename          text not null,
  uploaded_by       uuid not null references pta.profiles(id),
  status            text not null default 'uploaded'
                      check (status in ('uploaded', 'validated', 'committed', 'failed', 'cancelled')),
  update_enrollment boolean not null default false,  -- explicit opt-in (D16)
  total_rows        integer not null default 0,
  valid_rows        integer not null default 0,
  matched_rows      integer not null default 0,
  duplicate_rows    integer not null default 0,
  error_rows        integer not null default 0,
  created_students  integer not null default 0,
  created_guardians integer not null default 0,
  error_message     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index import_batches_school_idx on pta.student_import_batches (school_id, created_at desc);

create trigger import_batches_set_updated_at
  before update on pta.student_import_batches
  for each row execute function pta.set_updated_at();

create table pta.student_import_rows (
  id                uuid primary key default gen_random_uuid(),
  batch_id          uuid not null references pta.student_import_batches(id) on delete cascade,
  school_id         uuid not null references pta.schools(id) on delete cascade,
  row_number        integer not null,
  raw               jsonb not null,
  normalized        jsonb,
  status            text not null default 'valid'
                      check (status in ('valid', 'error', 'duplicate', 'matched')),
  errors            jsonb,
  matched_student_id uuid references pta.students(id) on delete set null,
  created_at        timestamptz not null default now(),
  unique (batch_id, row_number)
);

create index import_rows_batch_idx on pta.student_import_rows (batch_id, status);
