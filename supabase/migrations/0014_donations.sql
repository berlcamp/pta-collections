-- 0014_donations.sql
-- PTA programs, activities, and the voluntary donations that fund them.
--
-- WHY THIS IS NOT A fee_type + student_charge
-- -------------------------------------------
-- Everything in 0003 is an OBLIGATION: a charge needs an enrollment (composite
-- FK), it is assessed to a student, and pta.create_payment refuses to take a
-- centavo more than the remaining balance. A donation is the opposite of all
-- three. It is voluntary, it has no fixed amount to overpay, and the donor may
-- be an alumnus, a barangay councillor or a sari-sari store with no student in
-- the school at all. Modelling one as the other would mean either inventing a
-- fake charge per donation or relaxing the overpayment guard on the money path
-- that guards fee collection. Both are worse than a second, parallel path.
--
-- So donations get their own tables, their own SECURITY DEFINER writers and
-- their own receipt series, and they never touch student_charges. In particular:
--
--   * Balances still come only from pta.v_student_charge_balances. A donation
--     creates no charge and no balance, and cannot settle one.
--   * Acknowledgements are numbered PREFIX-YYYY-D-000001 in a SEPARATE counter
--     from official receipts, so a donation acknowledgement can never be
--     mistaken for — or collide with — an OR for a fee.
--   * Day boundaries are computed in SQL in the school's timezone (D11), the
--     same way v_payments_local does it.
--   * There is NO stored fulfilled/outstanding column on a pledge, for the same
--     reason there is no stored paid column on a charge (D15). `status` holds
--     human-set states only; fulfilment is derived in v_donation_pledge_status.
--
-- Three kinds of giving are recorded:
--   cash     — money received now (cash, GCash, bank transfer, other)
--   in_kind  — goods or services, carried at an estimated peso value and kept
--              OUT of every cash total so the treasurer's drawer still balances
--   pledge   — a commitment to give later, fulfilled by cash/in-kind donations

-- ---------------------------------------------------------------------------
-- donation_programs
--
-- The thing being raised for: "Brigada Eskwela 2026", "Covered Court Fund",
-- "Grade 6 Recognition Day". Configuration, so it is written through RLS by an
-- admin like fee_types — not through an RPC.
-- ---------------------------------------------------------------------------

create table pta.donation_programs (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references pta.schools(id) on delete cascade,
  school_year_id uuid not null references pta.school_years(id) on delete restrict,
  name           text not null,
  description    text,
  category       text not null default 'program'
                   check (category in ('program', 'activity', 'project', 'fund', 'other')),
  -- Optional goal. Null means "no target" — a general fund is still legitimate.
  target_amount  numeric(12,2) check (target_amount is null or target_amount > 0),
  starts_on      date,
  ends_on        date,
  -- Only an 'open' program accepts new donations or pledges. 'closed' keeps
  -- every historical row readable and reportable but refuses new ones.
  status         text not null default 'open'
                   check (status in ('planned', 'open', 'closed', 'cancelled')),
  status_reason  text,
  accepts_pledges boolean not null default true,
  accepts_in_kind boolean not null default true,
  created_by     uuid references pta.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (school_id, school_year_id, name),
  -- Lets donations and pledges carry a composite FK, so a row can never point
  -- at another school's program (the same trick 0013 uses for students).
  unique (id, school_id),
  constraint donation_programs_date_order
    check (starts_on is null or ends_on is null or ends_on >= starts_on)
);

create index donation_programs_school_idx
  on pta.donation_programs (school_id, school_year_id, status);

create trigger donation_programs_set_updated_at
  before update on pta.donation_programs
  for each row execute function pta.set_updated_at();

-- ---------------------------------------------------------------------------
-- donors
--
-- Anyone who gives. A donor row exists so repeat giving rolls up — "the Reyes
-- family has given ₱4,500 across three programs" — which a free-text name on
-- each donation could never answer.
--
-- guardian_id / student_id are OPTIONAL links, not the identity. A parent
-- donating is linked to their guardian record; a hardware store is not linked
-- to anything. display_name is always populated so every report has something
-- to print without a join.
-- ---------------------------------------------------------------------------

create table pta.donors (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references pta.schools(id) on delete cascade,
  donor_type     text not null default 'other'
                   check (donor_type in (
                     'guardian', 'alumnus', 'staff', 'business',
                     'government', 'organization', 'other')),
  display_name   text not null check (length(trim(display_name)) > 0),
  -- Set when the donor is a parent/guardian already on file. on delete set null:
  -- unlinking a guardian must never erase the giving history.
  guardian_id    uuid references pta.parents_guardians(id) on delete set null,
  -- "In honour of / family of" — reporting only. Never implies an obligation.
  student_id     uuid references pta.students(id) on delete set null,
  contact_number text,
  email          text,
  address        text,
  notes          text,
  active         boolean not null default true,
  created_by     uuid references pta.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, school_id)
);

create index donors_school_idx on pta.donors (school_id, active);
create index donors_name_trgm_idx on pta.donors using gin (display_name gin_trgm_ops);
create index donors_guardian_idx on pta.donors (guardian_id) where guardian_id is not null;
create index donors_student_idx on pta.donors (student_id) where student_id is not null;

create trigger donors_set_updated_at
  before update on pta.donors
  for each row execute function pta.set_updated_at();

-- ---------------------------------------------------------------------------
-- donation_pledges
--
-- A commitment made at an assembly, fulfilled (or not) later. D15 applies:
-- there is no stored fulfilled_amount. `status` is human-set only — 'open' or
-- 'cancelled' — and fulfilment is derived from the donations that reference it.
-- ---------------------------------------------------------------------------

create table pta.donation_pledges (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references pta.schools(id) on delete cascade,
  school_year_id uuid not null references pta.school_years(id) on delete restrict,
  -- Only the COMPOSITE fk below, never a second single-column one to the same
  -- table: two FKs between one pair of tables make PostgREST embeds ambiguous
  -- ("more than one relationship found") and it fails the request outright.
  program_id     uuid not null,
  -- A pledge is always attributable: an anonymous promise is not collectable.
  donor_id       uuid not null,
  pledged_amount numeric(12,2) not null check (pledged_amount > 0),
  due_date       date,
  status         text not null default 'open'
                   check (status in ('open', 'cancelled')),
  status_reason  text,
  notes          text,
  created_by     uuid references pta.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, school_id),
  constraint donation_pledges_reason_required
    check (status = 'open' or (status_reason is not null and length(trim(status_reason)) > 0)),
  constraint donation_pledges_program_fk
    foreign key (program_id, school_id)
    references pta.donation_programs (id, school_id) on delete restrict,
  constraint donation_pledges_donor_fk
    foreign key (donor_id, school_id)
    references pta.donors (id, school_id) on delete restrict
);

create index donation_pledges_program_idx
  on pta.donation_pledges (school_id, program_id, status);
create index donation_pledges_donor_idx on pta.donation_pledges (donor_id);
create index donation_pledges_due_idx
  on pta.donation_pledges (school_id, due_date) where status = 'open';

create trigger donation_pledges_set_updated_at
  before update on pta.donation_pledges
  for each row execute function pta.set_updated_at();

-- ---------------------------------------------------------------------------
-- donation_receipt_counters
--
-- Deliberately NOT pta.receipt_counters. Sharing the sequence would interleave
-- donation acknowledgements with official receipts and make "OR #412" ambiguous.
-- Gaps are expected here too (D18) — a rolled-back transaction burns a number.
-- ---------------------------------------------------------------------------

create table pta.donation_receipt_counters (
  school_id      uuid not null references pta.schools(id) on delete cascade,
  school_year_id uuid not null references pta.school_years(id) on delete cascade,
  next_seq       integer not null default 1 check (next_seq > 0),
  primary key (school_id, school_year_id)
);

-- ---------------------------------------------------------------------------
-- donations
--
-- Written ONLY by pta.record_donation / pta.void_donation. No insert or update
-- policy exists on this table (see the policies section below), exactly as for
-- pta.payments.
-- ---------------------------------------------------------------------------

create table pta.donations (
  id                    uuid primary key default gen_random_uuid(),
  school_id             uuid not null references pta.schools(id) on delete restrict,
  school_year_id        uuid not null references pta.school_years(id) on delete restrict,
  -- Composite FKs only (see donation_pledges above for why).
  program_id            uuid not null,
  -- Null ONLY for an anonymous donation. Enforced by donations_donor_identity.
  donor_id              uuid,
  -- Set when this donation redeems a standing pledge.
  pledge_id             uuid,
  acknowledgement_number text not null,
  donation_date         timestamptz not null default now(),
  kind                  text not null check (kind in ('cash', 'in_kind')),
  -- For cash: the money received. For in-kind: the estimated peso value, which
  -- every view keeps in its own column and never adds to a cash total.
  amount                numeric(12,2) not null check (amount > 0),
  payment_method        text check (payment_method in ('cash', 'gcash', 'bank_transfer', 'other')),
  reference_number      text,
  -- What was actually given: "20 sacks of cement", "2 days of carpentry".
  item_description      text,
  is_anonymous          boolean not null default false,
  remarks               text,
  received_by           uuid not null references pta.profiles(id) on delete restrict,
  status                text not null default 'posted' check (status in ('posted', 'voided')),
  voided_at             timestamptz,
  voided_by             uuid references pta.profiles(id),
  void_reason           text,
  acting_as_super_admin boolean not null default false,
  idempotency_key       text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- School-scoped, like payments. Two schools may both hold -D-000001.
  unique (school_id, acknowledgement_number),

  -- Cash carries a method and no item; in-kind carries an item and no method.
  -- Without this an in-kind row could quietly land in a cash drawer total.
  constraint donations_kind_shape check (
    (kind = 'cash'    and payment_method is not null and item_description is null)
    or
    (kind = 'in_kind' and payment_method is null
                      and item_description is not null
                      and length(trim(item_description)) > 0)
  ),

  -- Anonymous means anonymous: no donor row is attached, so no report can
  -- accidentally un-anonymise it by following the FK.
  constraint donations_donor_identity check (
    (is_anonymous and donor_id is null) or (not is_anonymous and donor_id is not null)
  ),

  -- D14 again: a void always carries who, when and why.
  constraint donations_void_fields check (
    status = 'posted' or (
      voided_at is not null and voided_by is not null
      and void_reason is not null and length(trim(void_reason)) > 0
    )
  ),

  -- An anonymous donation cannot redeem a pledge — a pledge names its donor.
  constraint donations_pledge_needs_donor check (
    pledge_id is null or donor_id is not null
  ),

  constraint donations_program_fk
    foreign key (program_id, school_id)
    references pta.donation_programs (id, school_id) on delete restrict,
  constraint donations_donor_fk
    foreign key (donor_id, school_id)
    references pta.donors (id, school_id) on delete restrict,
  constraint donations_pledge_fk
    foreign key (pledge_id, school_id)
    references pta.donation_pledges (id, school_id) on delete restrict
);

create unique index donations_idempotency_idx
  on pta.donations (school_id, idempotency_key)
  where idempotency_key is not null;

create index donations_program_idx on pta.donations (school_id, program_id, status);
create index donations_school_date_idx on pta.donations (school_id, donation_date desc);
create index donations_donor_idx on pta.donations (donor_id, donation_date desc);
create index donations_pledge_idx on pta.donations (pledge_id) where pledge_id is not null;
create index donations_receiver_idx on pta.donations (school_id, received_by, donation_date desc);
create index donations_ack_idx on pta.donations (school_id, acknowledgement_number);

create trigger donations_set_updated_at
  before update on pta.donations
  for each row execute function pta.set_updated_at();

-- ===========================================================================
-- Views. As in 0004: security_invoker, and every total excludes voided rows.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- v_donations_local — donations with the school-local calendar date attached.
-- The donation equivalent of v_payments_local (D11).
-- ---------------------------------------------------------------------------

create or replace view pta.v_donations_local
with (security_invoker = true) as
select
  d.*,
  (d.donation_date at time zone s.timezone)::date                     as collection_date,
  date_trunc('month', d.donation_date at time zone s.timezone)::date  as collection_month,
  s.timezone                                                          as school_timezone
from pta.donations d
join pta.schools s on s.id = d.school_id;

-- ---------------------------------------------------------------------------
-- v_donation_pledge_status — fulfilment, derived (D15).
--
-- A pledge is fulfilled by ANY posted donation pointing at it, cash or in-kind:
-- a parent who promised ₱1,000 and delivered ₱1,000 of plywood has kept their
-- word. Cash and in-kind are still reported separately alongside.
-- ---------------------------------------------------------------------------

create or replace view pta.v_donation_pledge_status
with (security_invoker = true) as
select
  pl.id,
  pl.school_id,
  pl.school_year_id,
  pl.program_id,
  prog.name        as program_name,
  pl.donor_id,
  dn.display_name  as donor_name,
  dn.contact_number as donor_contact,
  pl.pledged_amount,
  pl.due_date,
  pl.status,
  pl.status_reason,
  pl.notes,
  pl.created_at,
  coalesce(f.total, 0)      as fulfilled_amount,
  coalesce(f.cash_total, 0) as fulfilled_cash,
  coalesce(f.kind_total, 0) as fulfilled_in_kind,
  greatest(pl.pledged_amount - coalesce(f.total, 0), 0) as remaining_amount,
  case
    when pl.status = 'cancelled' then 'cancelled'
    when coalesce(f.total, 0) <= 0 then 'open'
    when coalesce(f.total, 0) >= pl.pledged_amount then 'fulfilled'
    else 'partially_fulfilled'
  end as fulfilment_status
from pta.donation_pledges pl
join pta.donation_programs prog on prog.id = pl.program_id
join pta.donors dn on dn.id = pl.donor_id
left join lateral (
  select
    sum(d.amount)                                      as total,
    sum(d.amount) filter (where d.kind = 'cash')       as cash_total,
    sum(d.amount) filter (where d.kind = 'in_kind')    as kind_total
  from pta.donations d
  where d.pledge_id = pl.id and d.status = 'posted'
) f on true;

-- ---------------------------------------------------------------------------
-- v_donation_program_totals — the progress bar behind every program card.
--
-- cash_received is the only figure that belongs in a cash reconciliation.
-- in_kind_value is carried beside it, never inside it.
-- ---------------------------------------------------------------------------

create or replace view pta.v_donation_program_totals
with (security_invoker = true) as
select
  prog.id            as program_id,
  prog.school_id,
  prog.school_year_id,
  prog.name,
  prog.description,
  prog.category,
  prog.status,
  prog.target_amount,
  prog.starts_on,
  prog.ends_on,
  prog.accepts_pledges,
  prog.accepts_in_kind,
  prog.created_at,
  coalesce(d.cash_received, 0)   as cash_received,
  coalesce(d.in_kind_value, 0)   as in_kind_value,
  coalesce(d.total_received, 0)  as total_received,
  coalesce(d.donation_count, 0)  as donation_count,
  coalesce(d.donor_count, 0)     as donor_count,
  coalesce(p.pledged_total, 0)   as pledged_total,
  -- What is still promised but not yet in hand. Clamped per pledge inside the
  -- status view, so an over-delivered pledge cannot cancel out a short one.
  coalesce(p.pledge_outstanding, 0) as pledge_outstanding,
  case
    when prog.target_amount is null or prog.target_amount = 0 then null
    else round(
      least(coalesce(d.total_received, 0) / prog.target_amount, 1) * 100, 1)
  end as progress_pct
from pta.donation_programs prog
left join lateral (
  select
    sum(dd.amount) filter (where dd.kind = 'cash')    as cash_received,
    sum(dd.amount) filter (where dd.kind = 'in_kind') as in_kind_value,
    sum(dd.amount)                                    as total_received,
    count(*)                                          as donation_count,
    count(distinct dd.donor_id)                       as donor_count
  from pta.donations dd
  where dd.program_id = prog.id and dd.status = 'posted'
) d on true
left join lateral (
  select
    sum(ps.pledged_amount)   as pledged_total,
    sum(ps.remaining_amount) as pledge_outstanding
  from pta.v_donation_pledge_status ps
  where ps.program_id = prog.id and ps.status = 'open'
) p on true;

-- ---------------------------------------------------------------------------
-- v_daily_donations — the donation line on the cashier's day sheet.
--
-- Cash only in the money columns. Whoever received the donation reconciles it
-- against the same drawer as their fee collections, so it has to bucket by the
-- same school-local date the payments views use.
-- ---------------------------------------------------------------------------

create or replace view pta.v_daily_donations
with (security_invoker = true) as
select
  d.school_id,
  d.school_year_id,
  d.collection_date,
  d.received_by,
  d.payment_method,
  sum(d.amount) filter (where d.kind = 'cash')    as cash_total,
  sum(d.amount) filter (where d.kind = 'in_kind') as in_kind_total,
  count(*) filter (where d.kind = 'cash')         as cash_count,
  count(*) filter (where d.kind = 'in_kind')      as in_kind_count
from pta.v_donations_local d
where d.status = 'posted'
group by d.school_id, d.school_year_id, d.collection_date, d.received_by, d.payment_method;

-- ---------------------------------------------------------------------------
-- v_donor_totals — giving history per donor, across programs.
--
-- Anonymous donations have no donor_id and so are absent here by construction.
-- Their money is still in v_donation_program_totals; it simply has no name.
-- ---------------------------------------------------------------------------

create or replace view pta.v_donor_totals
with (security_invoker = true) as
select
  dn.id            as donor_id,
  dn.school_id,
  d.school_year_id,
  dn.display_name,
  dn.donor_type,
  dn.contact_number,
  dn.guardian_id,
  dn.student_id,
  sum(d.amount) filter (where d.kind = 'cash')    as cash_given,
  sum(d.amount) filter (where d.kind = 'in_kind') as in_kind_given,
  sum(d.amount)                                   as total_given,
  count(*)                                        as donation_count,
  count(distinct d.program_id)                    as program_count,
  max(d.donation_date)                            as last_donation_at
from pta.donors dn
join pta.donations d on d.donor_id = dn.id and d.status = 'posted'
group by dn.id, dn.school_id, d.school_year_id, dn.display_name,
         dn.donor_type, dn.contact_number, dn.guardian_id, dn.student_id;

-- ===========================================================================
-- RLS
-- ===========================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'donation_programs', 'donors', 'donation_pledges',
    'donation_receipt_counters', 'donations'
  ] loop
    execute format('alter table pta.%I enable row level security', t);
    execute format('alter table pta.%I force row level security', t);
  end loop;
end $$;

-- Programs are configuration: tenant-readable, admin-writable, like fee_types.
create policy donation_programs_read on pta.donation_programs for select to authenticated
using (school_id = any (pta.current_school_ids()));

create policy donation_programs_admin_write on pta.donation_programs for all to authenticated
using (pta.has_school_role(school_id, array['admin']))
with check (pta.has_school_role(school_id, array['admin']));

-- Donors are a directory, not money. A cashier never writes one directly —
-- pta.record_donation creates them — but an admin or treasurer corrects a
-- misspelt name without needing a migration.
create policy donors_read on pta.donors for select to authenticated
using (school_id = any (pta.current_school_ids()));

create policy donors_manage_write on pta.donors for all to authenticated
using (pta.has_school_role(school_id, array['admin', 'treasurer']))
with check (pta.has_school_role(school_id, array['admin', 'treasurer']));

-- Pledges and donations: READ ONLY through RLS, exactly like payments.
-- No insert/update/delete policy exists. pta.create_pledge, pta.cancel_pledge,
-- pta.record_donation and pta.void_donation are the only writers.
create policy donation_pledges_read on pta.donation_pledges for select to authenticated
using (school_id = any (pta.current_school_ids()));

create policy donations_read on pta.donations for select to authenticated
using (school_id = any (pta.current_school_ids()));

create policy donation_counters_read on pta.donation_receipt_counters for select to authenticated
using (school_id = any (pta.current_school_ids()));

-- ===========================================================================
-- RPCs — the only writers of pledges and donations.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- pta.upsert_donor
--
-- Find-or-create, so a cashier recording a walk-in donation does not have to
-- visit a separate "add donor" screen mid-queue, and so the same parent giving
-- twice does not become two donor rows.
--
-- Matching is deliberately narrow: an explicit guardian_id, else an exact
-- case-insensitive name match within the school. Fuzzy matching on a donor name
-- would silently merge "J. Reyes Hardware" into "J. Reyes".
-- ---------------------------------------------------------------------------

create or replace function pta.upsert_donor(
  p_school_id      uuid,
  p_display_name   text,
  p_donor_type     text default 'other',
  p_guardian_id    uuid default null,
  p_student_id     uuid default null,
  p_contact_number text default null,
  p_email          text default null,
  p_address        text default null
)
returns uuid
language plpgsql
security definer
set search_path = pta, public
as $$
declare
  v_name  text := nullif(trim(coalesce(p_display_name, '')), '');
  v_id    uuid;
begin
  perform pta.require_school_role(p_school_id, array['admin', 'cashier', 'treasurer']);

  if p_guardian_id is not null then
    -- The guardian must belong to this school. Without this check a caller
    -- could attach another tenant's guardian to their own donor row.
    if not exists (
      select 1 from pta.parents_guardians g
      where g.id = p_guardian_id and g.school_id = p_school_id
    ) then
      raise exception 'Guardian % does not belong to this school.', p_guardian_id
        using errcode = '42501';
    end if;

    select d.id into v_id
    from pta.donors d
    where d.school_id = p_school_id and d.guardian_id = p_guardian_id
    limit 1;

    if found then
      return v_id;
    end if;

    -- Fall back to the guardian's own name when the caller supplied none.
    if v_name is null then
      select trim(g.first_name || ' ' || g.last_name) into v_name
      from pta.parents_guardians g where g.id = p_guardian_id;
    end if;
  end if;

  if v_name is null then
    raise exception 'A donor needs a name.';
  end if;

  if p_student_id is not null and not exists (
    select 1 from pta.students s
    where s.id = p_student_id and s.school_id = p_school_id
  ) then
    raise exception 'Student % does not belong to this school.', p_student_id
      using errcode = '42501';
  end if;

  if p_guardian_id is null then
    select d.id into v_id
    from pta.donors d
    where d.school_id = p_school_id
      and lower(d.display_name) = lower(v_name)
      and d.guardian_id is null
    limit 1;

    if found then
      return v_id;
    end if;
  end if;

  insert into pta.donors (
    school_id, donor_type, display_name, guardian_id, student_id,
    contact_number, email, address, created_by
  ) values (
    p_school_id,
    coalesce(nullif(trim(p_donor_type), ''), 'other'),
    v_name,
    p_guardian_id,
    p_student_id,
    nullif(trim(coalesce(p_contact_number, '')), ''),
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_address, '')), ''),
    pta.current_profile_id()
  )
  returning id into v_id;

  perform pta.write_audit(
    p_school_id, 'DONOR_CREATED', 'donor', v_id, null,
    jsonb_build_object('display_name', v_name, 'donor_type', p_donor_type)
  );

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- pta.record_donation
--
-- The donation equivalent of pta.create_payment, and the ONLY writer of
-- pta.donations. Either p_donor_id or p_donor (a jsonb of new-donor fields) may
-- be supplied; both are ignored when p_is_anonymous is true.
--
-- p_donor: {"display_name": "...", "donor_type": "...", "guardian_id": "...",
--           "student_id": "...", "contact_number": "...", "email": "...",
--           "address": "..."}
-- ---------------------------------------------------------------------------

create or replace function pta.record_donation(
  p_school_id        uuid,
  p_school_year_id   uuid,
  p_program_id       uuid,
  p_kind             text,
  p_amount           numeric,
  p_payment_method   text default null,
  p_item_description text default null,
  p_donor_id         uuid default null,
  p_donor            jsonb default null,
  p_is_anonymous     boolean default false,
  p_pledge_id        uuid default null,
  p_reference_number text default null,
  p_remarks          text default null,
  p_idempotency_key  text default null
)
returns table (donation_id uuid, acknowledgement_number text, amount numeric)
language plpgsql
security definer
set search_path = pta, public
as $$
declare
  v_profile_id uuid := pta.current_profile_id();
  v_program    pta.donation_programs;
  v_pledge     pta.donation_pledges;
  v_existing   record;
  v_donor_id   uuid := p_donor_id;
  v_amount     numeric(12,2);
  v_seq        integer;
  v_prefix     text;
  v_year       text;
  v_ack        text;
  v_id         uuid;
  v_acting     boolean;
begin
  -- 1. Authorization — the same three roles that may take a fee payment.
  perform pta.require_school_role(p_school_id, array['admin', 'cashier', 'treasurer']);

  if v_profile_id is null then
    raise exception 'No profile for the current user.' using errcode = '42501';
  end if;

  -- 2. Idempotency, before anything else is written.
  if p_idempotency_key is not null then
    select d.id, d.acknowledgement_number, d.amount into v_existing
    from pta.donations d
    where d.school_id = p_school_id and d.idempotency_key = p_idempotency_key;

    if found then
      donation_id := v_existing.id;
      acknowledgement_number := v_existing.acknowledgement_number;
      amount := v_existing.amount;
      return next;
      return;
    end if;
  end if;

  -- 3. Shape of the donation.
  if p_kind not in ('cash', 'in_kind') then
    raise exception 'Invalid donation kind: %. Expected cash or in_kind.', p_kind;
  end if;

  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount <= 0 then
    raise exception 'A donation must be greater than zero.';
  end if;

  if p_kind = 'cash' then
    if p_payment_method is null or p_payment_method not in
       ('cash', 'gcash', 'bank_transfer', 'other') then
      raise exception 'A cash donation needs a payment method.';
    end if;
  else
    if p_item_description is null or length(trim(p_item_description)) = 0 then
      raise exception 'An in-kind donation must describe what was given.';
    end if;
  end if;

  -- 4. The program must be this school's, in this year, and open.
  select * into v_program
  from pta.donation_programs
  where id = p_program_id
  for update;

  if not found then
    raise exception 'Program % does not exist.', p_program_id;
  end if;
  if v_program.school_id <> p_school_id then
    raise exception 'Program % belongs to another school.', p_program_id
      using errcode = '42501';
  end if;
  if v_program.school_year_id <> p_school_year_id then
    raise exception 'Program "%" belongs to a different school year.', v_program.name;
  end if;
  if v_program.status <> 'open' then
    raise exception 'Program "%" is % and is not accepting donations.',
      v_program.name, v_program.status;
  end if;
  if p_kind = 'in_kind' and not v_program.accepts_in_kind then
    raise exception 'Program "%" does not accept in-kind donations.', v_program.name;
  end if;

  -- 5. Donor identity. Anonymous wins outright: no donor row is created or
  --    attached, so nothing downstream can put a name to it.
  if p_is_anonymous then
    v_donor_id := null;
  else
    if v_donor_id is null and p_donor is not null then
      v_donor_id := pta.upsert_donor(
        p_school_id,
        p_donor ->> 'display_name',
        coalesce(p_donor ->> 'donor_type', 'other'),
        nullif(p_donor ->> 'guardian_id', '')::uuid,
        nullif(p_donor ->> 'student_id', '')::uuid,
        p_donor ->> 'contact_number',
        p_donor ->> 'email',
        p_donor ->> 'address'
      );
    end if;

    if v_donor_id is null then
      raise exception 'A donation needs a donor, or must be marked anonymous.';
    end if;

    if not exists (
      select 1 from pta.donors d
      where d.id = v_donor_id and d.school_id = p_school_id
    ) then
      raise exception 'Donor % belongs to another school.', v_donor_id
        using errcode = '42501';
    end if;
  end if;

  -- 6. Pledge redemption, when this donation settles a standing promise.
  if p_pledge_id is not null then
    select * into v_pledge
    from pta.donation_pledges
    where id = p_pledge_id
    for update;

    if not found then
      raise exception 'Pledge % does not exist.', p_pledge_id;
    end if;
    if v_pledge.school_id <> p_school_id then
      raise exception 'Pledge % belongs to another school.', p_pledge_id
        using errcode = '42501';
    end if;
    if v_pledge.program_id <> p_program_id then
      raise exception 'That pledge was made to a different program.';
    end if;
    if v_pledge.status <> 'open' then
      raise exception 'Pledge is % and cannot be redeemed.', v_pledge.status;
    end if;
    if v_donor_id is null or v_pledge.donor_id <> v_donor_id then
      raise exception 'A pledge can only be redeemed by the donor who made it.';
    end if;
    -- NOTE: no overpayment guard here, unlike create_payment. Giving more than
    -- you promised is generosity, not an error; v_donation_pledge_status clamps
    -- remaining_amount at zero so the surplus never reads as negative debt.
  end if;

  -- 7. Acknowledgement number, from the donation counter (never the OR counter).
  insert into pta.donation_receipt_counters (school_id, school_year_id, next_seq)
  values (p_school_id, p_school_year_id, 1)
  on conflict (school_id, school_year_id) do nothing;

  select rc.next_seq into v_seq
  from pta.donation_receipt_counters rc
  where rc.school_id = p_school_id and rc.school_year_id = p_school_year_id
  for update;

  select s.receipt_prefix into v_prefix from pta.schools s where s.id = p_school_id;
  select left(sy.name, 4) into v_year from pta.school_years sy where sy.id = p_school_year_id;

  -- The 'D' segment is what stops an acknowledgement being read as an OR.
  v_ack := v_prefix || '-' || v_year || '-D-' || lpad(v_seq::text, 6, '0');

  update pta.donation_receipt_counters
     set next_seq = next_seq + 1
   where school_id = p_school_id and school_year_id = p_school_year_id;

  -- 8. Insert.
  v_acting := pta.acting_as_super_admin(p_school_id);

  insert into pta.donations (
    school_id, school_year_id, program_id, donor_id, pledge_id,
    acknowledgement_number, donation_date, kind, amount, payment_method,
    reference_number, item_description, is_anonymous, remarks,
    received_by, status, acting_as_super_admin, idempotency_key
  ) values (
    p_school_id, p_school_year_id, p_program_id, v_donor_id, p_pledge_id,
    v_ack, now(), p_kind, v_amount,
    case when p_kind = 'cash' then p_payment_method else null end,
    nullif(trim(coalesce(p_reference_number, '')), ''),
    case when p_kind = 'in_kind' then trim(p_item_description) else null end,
    p_is_anonymous,
    nullif(trim(coalesce(p_remarks, '')), ''),
    v_profile_id, 'posted', v_acting, p_idempotency_key
  )
  returning id into v_id;

  perform pta.write_audit(
    p_school_id, 'DONATION_RECORDED', 'donation', v_id, null,
    jsonb_build_object(
      'acknowledgement_number', v_ack,
      'program_id', p_program_id,
      'program_name', v_program.name,
      'donor_id', v_donor_id,
      'is_anonymous', p_is_anonymous,
      'pledge_id', p_pledge_id,
      'kind', p_kind,
      'amount', v_amount,
      'payment_method', p_payment_method,
      'item_description', p_item_description
    )
  );

  donation_id := v_id;
  acknowledgement_number := v_ack;
  amount := v_amount;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- pta.void_donation
--
-- Mirrors pta.void_payment down to the role split: a cashier records, only an
-- admin or treasurer reverses. The acknowledgement number is never reused.
-- ---------------------------------------------------------------------------

create or replace function pta.void_donation(p_donation_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = pta, public
as $$
declare
  v_donation pta.donations;
begin
  select * into v_donation from pta.donations where id = p_donation_id for update;
  if not found then
    raise exception 'Donation % does not exist.', p_donation_id;
  end if;

  perform pta.require_school_role(v_donation.school_id, array['admin', 'treasurer']);

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A void requires a reason.';
  end if;

  if v_donation.status = 'voided' then
    raise exception 'Donation % is already voided. Voids are irreversible.',
      v_donation.acknowledgement_number;
  end if;

  update pta.donations
     set status      = 'voided',
         voided_at   = now(),
         voided_by   = pta.current_profile_id(),
         void_reason = trim(p_reason)
   where id = p_donation_id;

  perform pta.write_audit(
    v_donation.school_id, 'DONATION_VOIDED', 'donation', p_donation_id,
    jsonb_build_object('status', 'posted',
                       'acknowledgement_number', v_donation.acknowledgement_number,
                       'amount', v_donation.amount),
    jsonb_build_object('status', 'voided', 'void_reason', trim(p_reason))
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- pta.create_pledge
-- ---------------------------------------------------------------------------

create or replace function pta.create_pledge(
  p_school_id      uuid,
  p_school_year_id uuid,
  p_program_id     uuid,
  p_amount         numeric,
  p_donor_id       uuid default null,
  p_donor          jsonb default null,
  p_due_date       date default null,
  p_notes          text default null
)
returns uuid
language plpgsql
security definer
set search_path = pta, public
as $$
declare
  v_program  pta.donation_programs;
  v_donor_id uuid := p_donor_id;
  v_amount   numeric(12,2);
  v_id       uuid;
begin
  perform pta.require_school_role(p_school_id, array['admin', 'treasurer', 'cashier']);

  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount <= 0 then
    raise exception 'A pledge must be greater than zero.';
  end if;

  select * into v_program from pta.donation_programs where id = p_program_id;
  if not found or v_program.school_id <> p_school_id then
    raise exception 'Program % does not exist in this school.', p_program_id
      using errcode = '42501';
  end if;
  if v_program.school_year_id <> p_school_year_id then
    raise exception 'Program "%" belongs to a different school year.', v_program.name;
  end if;
  if v_program.status <> 'open' then
    raise exception 'Program "%" is % and is not accepting pledges.',
      v_program.name, v_program.status;
  end if;
  if not v_program.accepts_pledges then
    raise exception 'Program "%" does not accept pledges.', v_program.name;
  end if;

  if v_donor_id is null and p_donor is not null then
    v_donor_id := pta.upsert_donor(
      p_school_id,
      p_donor ->> 'display_name',
      coalesce(p_donor ->> 'donor_type', 'other'),
      nullif(p_donor ->> 'guardian_id', '')::uuid,
      nullif(p_donor ->> 'student_id', '')::uuid,
      p_donor ->> 'contact_number',
      p_donor ->> 'email',
      p_donor ->> 'address'
    );
  end if;

  if v_donor_id is null then
    raise exception 'A pledge must name its donor — an anonymous promise is not collectable.';
  end if;

  if not exists (
    select 1 from pta.donors d where d.id = v_donor_id and d.school_id = p_school_id
  ) then
    raise exception 'Donor % belongs to another school.', v_donor_id
      using errcode = '42501';
  end if;

  insert into pta.donation_pledges (
    school_id, school_year_id, program_id, donor_id,
    pledged_amount, due_date, notes, created_by
  ) values (
    p_school_id, p_school_year_id, p_program_id, v_donor_id,
    v_amount, p_due_date, nullif(trim(coalesce(p_notes, '')), ''),
    pta.current_profile_id()
  )
  returning id into v_id;

  perform pta.write_audit(
    p_school_id, 'PLEDGE_CREATED', 'donation_pledge', v_id, null,
    jsonb_build_object(
      'program_id', p_program_id,
      'program_name', v_program.name,
      'donor_id', v_donor_id,
      'pledged_amount', v_amount,
      'due_date', p_due_date
    )
  );

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- pta.cancel_pledge
--
-- A pledge is a promise, not money, so cancelling one is a correction rather
-- than a void — but it still carries a reason, and donations already recorded
-- against it are left exactly where they are.
-- ---------------------------------------------------------------------------

create or replace function pta.cancel_pledge(p_pledge_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = pta, public
as $$
declare
  v_pledge pta.donation_pledges;
begin
  select * into v_pledge from pta.donation_pledges where id = p_pledge_id for update;
  if not found then
    raise exception 'Pledge % does not exist.', p_pledge_id;
  end if;

  perform pta.require_school_role(v_pledge.school_id, array['admin', 'treasurer']);

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Cancelling a pledge requires a reason.';
  end if;

  if v_pledge.status = 'cancelled' then
    raise exception 'That pledge is already cancelled.';
  end if;

  update pta.donation_pledges
     set status = 'cancelled', status_reason = trim(p_reason)
   where id = p_pledge_id;

  perform pta.write_audit(
    v_pledge.school_id, 'PLEDGE_CANCELLED', 'donation_pledge', p_pledge_id,
    jsonb_build_object('status', 'open', 'pledged_amount', v_pledge.pledged_amount),
    jsonb_build_object('status', 'cancelled', 'status_reason', trim(p_reason))
  );
end;
$$;

-- ===========================================================================
-- Grants. Same posture as the rest of pta: anon gets nothing.
-- ===========================================================================

grant select, insert, update, delete on
  pta.donation_programs, pta.donors, pta.donation_pledges,
  pta.donation_receipt_counters, pta.donations
  to authenticated;

grant select on
  pta.v_donations_local, pta.v_donation_pledge_status,
  pta.v_donation_program_totals, pta.v_daily_donations, pta.v_donor_totals
  to authenticated;

revoke all on pta.donation_programs, pta.donors, pta.donation_pledges,
              pta.donation_receipt_counters, pta.donations from anon;
revoke all on pta.v_donations_local, pta.v_donation_pledge_status,
              pta.v_donation_program_totals, pta.v_daily_donations,
              pta.v_donor_totals from anon;

revoke execute on function pta.upsert_donor(uuid, text, text, uuid, uuid, text, text, text) from public;
revoke execute on function pta.record_donation(uuid, uuid, uuid, text, numeric, text, text, uuid, jsonb, boolean, uuid, text, text, text) from public;
revoke execute on function pta.void_donation(uuid, text) from public;
revoke execute on function pta.create_pledge(uuid, uuid, uuid, numeric, uuid, jsonb, date, text) from public;
revoke execute on function pta.cancel_pledge(uuid, text) from public;

grant execute on function pta.upsert_donor(uuid, text, text, uuid, uuid, text, text, text) to authenticated;
grant execute on function pta.record_donation(uuid, uuid, uuid, text, numeric, text, text, uuid, jsonb, boolean, uuid, text, text, text) to authenticated;
grant execute on function pta.void_donation(uuid, text) to authenticated;
grant execute on function pta.create_pledge(uuid, uuid, uuid, numeric, uuid, jsonb, date, text) to authenticated;
grant execute on function pta.cancel_pledge(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The gate board (0013) reads pta with service_role, which BYPASSES RLS. It has
-- no business reading donor contact details, so nothing here is granted to it.
-- ---------------------------------------------------------------------------
