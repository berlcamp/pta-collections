-- 0016_parent_portal.sql
-- The Parent/Guardian Portal.
--
-- WHY THIS EXISTS
-- Everything in this schema so far is written by staff. A parent's only view of
-- their own child's fees was a receipt handed across a table, and their only
-- view of attendance was a Telegram message -- if somebody at the office
-- remembered to print them an enrolment slip. This migration gives the guardian
-- their own way in: a barcode card, a PIN, and a read surface scoped to their
-- own children.
--
-- ---------------------------------------------------------------------------
-- FOUR DELIBERATE DEPARTURES FROM THIS PROJECT'S RULES. All four are load-bearing.
-- ---------------------------------------------------------------------------
--
-- 1. A PORTAL GUARDIAN IS NOT A pta.profiles ROW.
--    profiles.auth_user_id carries a real FK to auth.users (0001). A portal
--    session is a custom JWT with no auth.users row behind it, so a guardian
--    structurally cannot be a profile. They live in pta.portal_accounts, and
--    every existing helper -- current_profile_id(), current_school_ids(),
--    has_school_role() -- returns null/empty/false for them. That is the point:
--    a portal token is worth NOTHING against the staff surface, and it fails
--    closed rather than by policy.
--
-- 2. THE PORTAL VIEWS ARE security_invoker = OFF.
--    Every other view here is security_invoker so RLS decides what the caller
--    sees. That cannot work for a portal user: the base tables' policies are
--    written against current_school_ids(), which is empty for them, so an
--    invoker view would correctly return zero rows forever.
--    The alternative was adding a second policy to students, attendance,
--    student_charges, payments and donation_programs -- widening the STAFF
--    surface in five places to serve a different audience.
--    Instead the guardian filter is compiled INTO each v_portal_* view, the
--    views are the only object granted, and the filter reads
--    pta.current_guardian_id() -- which comes from a signed claim and returns
--    null for staff, so a staff token gets zero rows from them too.
--    If you add a view to this file, the WHERE clause is not optional.
--
-- 3. THE PIN IS HASHED IN SQL, NOT IN TYPESCRIPT.
--    Verification has to happen inside Postgres. The only key this app's request
--    path holds is the anon key, and the anon key is public -- so any RPC that
--    RETURNED a pin_hash for TypeScript to check would let anyone harvest every
--    hash in the school. portal_login() therefore takes the PIN and returns only
--    an identity, and the hash never crosses the wire.
--    pgcrypto is NOT enabled on this project and adding an extension to a shared
--    database is not a thing this migration gets to do (0013:785 made the same
--    call). So the KDF is 25,000 rounds of the CORE sha256() built-in over a
--    per-account random salt.
--    Be honest about what that buys: a 6-digit PIN is 10^6, and against a
--    LEAKED hash no KDF saves you -- bcrypt at cost 12 would fall in a day.
--    The security here is that portal_accounts is readable by nobody (no anon
--    grant, no service_role grant, RLS forced), plus the lockout below. The
--    iterations only price up an offline attack that should never start.
--
-- 4. `anon` GAINS A SECOND AND THIRD EXECUTE GRANT.
--    0013 gave anon exactly one verb, record_attendance(), and said so loudly.
--    Logging in cannot require already being logged in, so portal_login() and
--    portal_lookup_school() are grantable to nobody else. Both are rate-limited,
--    neither returns a hash, and anon still holds no table privilege whatsoever.
--
-- ---------------------------------------------------------------------------
-- AND ONE BUG FIX, WHICH IS NOT OPTIONAL
-- ---------------------------------------------------------------------------
-- 0013 granted issue_enroll_token() to `authenticated` and gave it NO role
-- check at all. That was harmless while only staff held an authenticated token.
-- The moment a portal guardian holds one, any parent could mint a Telegram
-- enrolment token for ANY student in ANY school and point a stranger's bot at
-- someone else's child. It is fixed below, in the same file that creates the
-- risk.
--
-- Apply by hand in the SQL Editor, in order, like every other migration here.
-- Never `supabase db push`: the project is shared with construction-saas and
-- sms-demo.

-- ===========================================================================
-- 1. Card numbers
-- ===========================================================================

-- Luhn, the same check digit a credit card carries. It exists so a mis-scanned
-- barcode fails INSTANTLY and locally, instead of travelling to the server and
-- being counted as a wrong-card login attempt against the rate limiter.
create or replace function pta.luhn_ok(p_number text)
returns boolean
language plpgsql
immutable
as $$
declare
  v_sum int := 0;
  v_dbl boolean := false;
  v_d   int;
  i     int;
begin
  if p_number is null or p_number !~ '^[0-9]+$' then
    return false;
  end if;
  for i in reverse length(p_number)..1 loop
    v_d := substr(p_number, i, 1)::int;
    if v_dbl then
      v_d := v_d * 2;
      if v_d > 9 then v_d := v_d - 9; end if;
    end if;
    v_sum := v_sum + v_d;
    v_dbl := not v_dbl;
  end loop;
  return v_sum % 10 = 0;
end;
$$;

-- 15 random digits + 1 Luhn check digit.
--
-- Digits come from gen_random_uuid(), which is CSPRNG-backed, by REJECTION
-- SAMPLING: hex chars a-f are discarded rather than folded into 0-9, because
-- folding would make 0-5 twice as likely as 6-9 and hand an attacker most of a
-- digit of entropy per position for free. random() is not used anywhere here;
-- it is a PRNG and these are credentials.
--
-- TWO NIBBLES OF EVERY v4 UUID ARE NOT RANDOM and must be skipped:
--   position 13 is the VERSION and is always '4'
--   position 17 is the VARIANT and is only ever 8, 9, a or b
-- Left in, that constant '4' is picked up by nearly every draw. Measured over
-- 3000 generated digits before this skip existed: '4' appeared 460 times where
-- 300 was expected, and '1' only 241. Test PP7 is what caught it.
create or replace function pta.generate_card_number()
returns text
language plpgsql
volatile
as $$
declare
  v_digits text := '';
  v_hex    text;
  v_ch     text;
  v_sum    int := 0;
  v_dbl    boolean := true;   -- the check digit is position 16; doubling starts at 15
  v_d      int;
  i        int;
begin
  while length(v_digits) < 15 loop
    v_hex := replace(gen_random_uuid()::text, '-', '');
    for i in 1..length(v_hex) loop
      continue when i = 13 or i = 17;   -- version and variant: not random
      v_ch := substr(v_hex, i, 1);
      if v_ch between '0' and '9' and length(v_digits) < 15 then
        v_digits := v_digits || v_ch;
      end if;
    end loop;
  end loop;

  for i in reverse 15..1 loop
    v_d := substr(v_digits, i, 1)::int;
    if v_dbl then
      v_d := v_d * 2;
      if v_d > 9 then v_d := v_d - 9; end if;
    end if;
    v_sum := v_sum + v_d;
    v_dbl := not v_dbl;
  end loop;

  return v_digits || ((10 - (v_sum % 10)) % 10)::text;
end;
$$;

-- ===========================================================================
-- 2. PIN hashing  (see departure 3 in the header)
-- ===========================================================================

create or replace function pta.portal_hash_pin(p_pin text, p_salt text)
returns text
language plpgsql
immutable
as $$
declare
  v_h bytea;
  i   int;
begin
  v_h := sha256(convert_to(p_salt || ':' || p_pin, 'UTF8'));
  for i in 1..25000 loop
    v_h := sha256(v_h || convert_to(p_salt, 'UTF8'));
  end loop;
  return encode(v_h, 'hex');
end;
$$;

create or replace function pta.generate_pin()
returns text
language sql
volatile
as $$
  -- Six digits, uniformly drawn, CSPRNG-backed. lpad keeps a leading zero,
  -- which is a legitimate PIN and would otherwise silently become 5 digits.
  select lpad((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint % 1000000)::text, 6, '0');
$$;

-- ===========================================================================
-- 3. portal_accounts — the guardian's credential
--
-- Deliberately NOT columns on parents_guardians. 0013 granted service_role
-- SELECT on that table for the gate board, and service_role bypasses RLS -- so
-- a pin_hash living there would be readable by a key whose whole job is reading
-- the roster. This table is granted to nobody: not anon, not service_role.
-- ===========================================================================

create table pta.portal_accounts (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references pta.schools(id) on delete cascade,
  -- One card per guardian. A guardian row is school-scoped, so a parent with
  -- children at two schools legitimately holds two cards; there is deliberately
  -- no cross-school person identity (it would be the first object in `pta` that
  -- is not school-scoped, and would leak school B's existence to school A).
  guardian_id       uuid not null unique references pta.parents_guardians(id) on delete cascade,
  -- GLOBALLY unique, unlike student_cards.card_uid which is unique per school.
  -- Global is what lets the login form be a single field: a parent should never
  -- be asked to pick a tenant out of a dropdown.
  card_number       text not null unique,
  pin_hash          text not null,
  pin_salt          text not null,
  -- Issuance mints an initial PIN the office reads out or prints on a tear-off.
  -- Like an ATM card, it is worthless until the parent replaces it.
  must_change_pin   boolean not null default true,
  status            text not null default 'active'
                      check (status in ('active', 'revoked')),
  status_reason     text,
  locale            text not null default 'en' check (locale in ('en', 'tl')),
  failed_attempts   int not null default 0,
  locked_until      timestamptz,
  last_login_at     timestamptz,
  issued_by         uuid references pta.profiles(id),
  issued_at         timestamptz not null default now(),
  revoked_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint portal_accounts_card_format
    check (card_number ~ '^[0-9]{16}$' and pta.luhn_ok(card_number)),
  constraint portal_accounts_revoke_fields
    check (status = 'active' or (revoked_at is not null and status_reason is not null)),
  -- Composite target so payment_claims can carry (guardian_id, school_id) and
  -- never straddle two tenants. Same trick 0013 used for students.
  unique (guardian_id, school_id)
);

create index portal_accounts_school_idx on pta.portal_accounts (school_id, status);

create trigger portal_accounts_set_updated_at
  before update on pta.portal_accounts
  for each row execute function pta.set_updated_at();

-- ---------------------------------------------------------------------------
-- portal_login_attempts — the OTHER half of rate limiting
--
-- portal_accounts.failed_attempts stops someone guessing the PIN of a card they
-- hold. It does nothing about someone guessing 16-digit CARD NUMBERS, because a
-- wrong card number matches no account and so increments no counter. This table
-- is that counter. Keyed by IP, swept by the login function itself.
-- ---------------------------------------------------------------------------

create table pta.portal_login_attempts (
  id          bigserial primary key,
  ip          text not null,
  card_number text,
  succeeded   boolean not null default false,
  attempted_at timestamptz not null default now()
);

create index portal_login_attempts_ip_idx
  on pta.portal_login_attempts (ip, attempted_at desc);

-- ===========================================================================
-- 4. payment_claims — money the parent SAYS they sent
--
-- The single most important property of this table: a submitted claim is not a
-- payment. It creates no pta.payments row, consumes no receipt number from
-- receipt_counters, and moves nothing in v_student_charge_balances. A balance
-- that drops on an unverified claim is a lie told to a parent and a hole in the
-- treasurer's drawer at the same time.
--
-- Approval calls the EXISTING create_payment() / record_donation(), so
-- collected_by / received_by is the real profile id of the staff member who
-- checked the GCash app. Nobody invents a system profile: somebody attested
-- that this money arrived, and the audit trail should say who.
-- ===========================================================================

create table pta.payment_claims (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references pta.schools(id) on delete cascade,
  guardian_id       uuid not null,
  school_year_id    uuid not null references pta.school_years(id) on delete restrict,
  claim_type        text not null check (claim_type in ('fee', 'donation')),

  -- fee: which student and which charges. donation: which program.
  student_id        uuid,
  program_id        uuid,
  -- [{charge_id, amount}, ...] for a fee claim; null for a donation.
  items             jsonb,

  claimed_amount    numeric(12,2) not null check (claimed_amount > 0),
  payment_method    text not null default 'gcash'
                      check (payment_method in ('gcash', 'bank_transfer', 'other')),
  reference_number  text not null,
  proof_path        text,
  is_anonymous      boolean not null default false,
  remarks           text,

  status            text not null default 'submitted'
                      check (status in ('submitted', 'approved', 'rejected')),
  reviewed_by       uuid references pta.profiles(id),
  reviewed_at       timestamptz,
  review_reason     text,
  -- Set on approval. The link from "what the parent claimed" to "the receipt
  -- they were eventually given".
  payment_id        uuid references pta.payments(id) on delete set null,
  donation_id       uuid references pta.donations(id) on delete set null,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint payment_claims_guardian_fk
    foreign key (guardian_id, school_id)
    references pta.portal_accounts (guardian_id, school_id) on delete cascade,
  constraint payment_claims_student_fk
    foreign key (student_id, school_id)
    references pta.students (id, school_id) on delete restrict,
  constraint payment_claims_program_fk
    foreign key (program_id, school_id)
    references pta.donation_programs (id, school_id) on delete restrict,
  -- A fee claim names a student and charges; a donation names a program.
  -- Without this a claim could be approved down a branch it was never built for.
  constraint payment_claims_shape check (
    (claim_type = 'fee'      and student_id is not null and items is not null
                             and program_id is null)
 or (claim_type = 'donation' and program_id is not null and items is null)
  ),
  constraint payment_claims_review_fields check (
    status = 'submitted' or (reviewed_by is not null and reviewed_at is not null)
  ),
  constraint payment_claims_reject_reason check (
    status <> 'rejected' or (review_reason is not null and length(trim(review_reason)) > 0)
  )
);

-- One GCash reference, one claim. A parent who double-submits the form, or who
-- tries to spend the same transfer twice, collides here rather than at review.
create unique index payment_claims_reference_idx
  on pta.payment_claims (school_id, lower(btrim(reference_number)));

create index payment_claims_queue_idx
  on pta.payment_claims (school_id, status, created_at desc);
create index payment_claims_guardian_idx
  on pta.payment_claims (guardian_id, created_at desc);

create trigger payment_claims_set_updated_at
  before update on pta.payment_claims
  for each row execute function pta.set_updated_at();

-- ===========================================================================
-- 5. current_guardian_id() — the portal's answer to current_profile_id()
--
-- Reads the guardian_id claim off the verified JWT. Three things matter:
--
--   * It re-checks portal_accounts.status on EVERY call, so revoking a lost
--     card kills sessions that are already open. A 12-hour token you cannot
--     revoke is not acceptable for a feed of a child's movements -- this is the
--     same reasoning 0005 gives for its helpers not being JWT claims.
--   * It returns NULL for a staff token, which has no such claim. Every portal
--     view filters on `= pta.current_guardian_id()`, and `= null` matches
--     nothing, so the whole portal surface fails closed for staff.
--   * It reads request.jwt.claims directly rather than auth.jwt(), so it
--     behaves identically under the local test harness.
-- ===========================================================================

create or replace function pta.current_guardian_id()
returns uuid
language sql
stable
security definer
set search_path = pta, public
as $$
  select a.guardian_id
    from pta.portal_accounts a
   where a.guardian_id = nullif(
           nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'guardian_id',
           ''
         )::uuid
     and a.status = 'active'
     and exists (select 1 from pta.schools s where s.id = a.school_id and s.active);
$$;

-- The guardian's school, for the same reasons. Null when not a portal session.
create or replace function pta.current_guardian_school_id()
returns uuid
language sql
stable
security definer
set search_path = pta, public
as $$
  select a.school_id
    from pta.portal_accounts a
   where a.guardian_id = pta.current_guardian_id();
$$;

-- ===========================================================================
-- 6. The portal read surface  (see departure 2 in the header)
--
-- security_invoker = OFF on every view here, with the guardian filter compiled
-- in. Read that note before adding anything to this section.
-- ===========================================================================

-- FIRST, THE ROW SOURCES.
--
-- A view marked security_invoker = off does NOT lend its owner's rights to a
-- security_invoker = on view it selects from: the inner view is still evaluated
-- as the session user, whose RLS returns nothing for a portal token. So the
-- three canonical views this portal depends on --
--
--   v_student_charge_balances  (D15, the only source of a balance)
--   v_attendance_local         (D11, the only source of a school-local day)
--   v_donation_pledge_status   (D15 again, the only source of fulfilment)
--
-- -- cannot be read from a portal view directly. A SECURITY DEFINER FUNCTION
-- does change the effective user, so each is wrapped in one, filtered to the
-- caller's own children.
--
-- The alternative was re-deriving the balance formula and the Manila day
-- boundary inside the portal views. That is exactly the duplication D11 and D15
-- exist to forbid: two definitions of "balance" drift, and the parent's number
-- stops matching the treasurer's.

create or replace function pta.portal_balance_rows()
returns setof pta.v_student_charge_balances
language sql
stable
security definer
set search_path = pta, public
as $$
  select b.*
    from pta.v_student_charge_balances b
    join pta.student_guardians sg on sg.student_id = b.student_id
   where sg.guardian_id = pta.current_guardian_id()
     and b.status <> 'cancelled';
$$;

-- The visibility window lives HERE, applied before a row is ever returned:
--   primary guardian -> the whole current school year
--   any other linked guardian -> today and the previous 7 days
--
-- A guardian relationship is not automatically a right to a durable movement
-- log of a minor. attendance_resolved deliberately preserves who held the card
-- at scan time, which makes this an accurate history -- and an accurate
-- stalking aid. Somebody has to be able to answer "was she in school on the
-- 14th"; nobody needs three years.
create or replace function pta.portal_attendance_rows()
returns setof pta.v_attendance_local
language sql
stable
security definer
set search_path = pta, public
as $$
  select a.*
    from pta.v_attendance_local a
    join pta.student_guardians sg on sg.student_id = a.student_id
    join pta.school_years sy on sy.school_id = a.school_id and sy.is_active
   where sg.guardian_id = pta.current_guardian_id()
     and a.student_id is not null
     and case
           when sg.is_primary
             then a.local_date >= sy.start_date and a.local_date <= sy.end_date
           else a.local_date >= (current_date - 7)
         end;
$$;

create or replace function pta.portal_pledge_rows()
returns setof pta.v_donation_pledge_status
language sql
stable
security definer
set search_path = pta, public
as $$
  select ps.*
    from pta.v_donation_pledge_status ps
    join pta.donors d on d.id = ps.donor_id
   where d.guardian_id = pta.current_guardian_id();
$$;

-- v_portal_children — the guardian's children, with what the portal needs to
-- render a card for each: current balance, and whether they are actually
-- enrolled this year.
--
-- enrollment matters beyond display: pta.payments carries an FK to
-- student_enrollments, so a claim against a non-enrolled student CANNOT be
-- approved. Better to know that at submission than three days later.
create or replace view pta.v_portal_children
with (security_invoker = off) as
select
  sg.guardian_id,
  s.school_id,
  s.id                                  as student_id,
  pta.display_name(s.last_name, s.first_name, s.middle_name, s.suffix) as full_name,
  coalesce(en.student_number, s.lrn)    as student_no,
  en.grade_level,
  sec.name                              as section_name,
  sg.relationship,
  sg.is_primary,
  sg.notify,
  sy.id                                 as school_year_id,
  sy.name                               as school_year_name,
  (en.id is not null)                   as is_enrolled,
  coalesce(bal.total_balance, 0)        as outstanding_balance,
  (select count(*) from pta.student_cards c
    where c.student_id = s.id and c.revoked_at is null) > 0 as has_gate_card
from pta.student_guardians sg
join pta.students s on s.id = sg.student_id
left join pta.school_years sy
       on sy.school_id = s.school_id and sy.is_active
left join pta.student_enrollments en
       on en.student_id = s.id and en.school_year_id = sy.id and en.status = 'enrolled'
left join pta.sections sec on sec.id = en.section_id
left join lateral (
  select sum(b.balance) as total_balance
    from pta.portal_balance_rows() b
   where b.student_id = s.id
) bal on true
where sg.guardian_id = pta.current_guardian_id();

-- v_portal_attendance — the child's gate scans, through v_attendance_local so
-- the day boundary is Manila's and computed in SQL (D11). Never bucket
-- scanned_at in the browser: a parent in a different timezone would see
-- yesterday.
--
-- THE VISIBILITY WINDOW IS IN THIS VIEW, not in the page.
--   * primary guardian: the full current school year
--   * any other linked guardian: today and the previous 7 days
-- A guardian relationship is not automatically a right to a durable movement
-- log of a minor. attendance_resolved deliberately preserves who held the card
-- at scan time, which makes it an accurate, subpoena-shaped history -- and an
-- accurate stalking aid. Primary gets the year because somebody has to be able
-- to answer "was she in school on the 14th"; nobody needs three years.
create or replace view pta.v_portal_attendance
with (security_invoker = off) as
select
  sg.guardian_id,
  a.event_id,
  a.school_id,
  a.student_id,
  a.full_name,
  a.student_no,
  a.grade_level,
  a.section_name,
  a.scanned_at,
  a.local_date,
  a.direction,
  a.queued,
  a.clock_synced,
  -- The path only. A URL is minted per-request by portal_capture_path() after a
  -- guardianship check; it is never embedded in a view a page might cache.
  case when sg.is_primary then a.image_path else null end as image_path
-- The window is already applied inside portal_attendance_rows(); this join
-- exists only to recover is_primary, which decides the picture above.
from pta.portal_attendance_rows() a
join pta.student_guardians sg
  on sg.student_id = a.student_id
 and sg.guardian_id = pta.current_guardian_id();

-- v_portal_balances — the child's unsettled charges, one row per charge.
-- Reads v_student_charge_balances, which is the single source of truth (D15).
-- There is no stored paid/unpaid column anywhere and this view does not invent one.
create or replace view pta.v_portal_balances
with (security_invoker = off) as
select
  sg.guardian_id,
  b.id            as charge_id,
  b.school_id,
  b.student_id,
  b.school_year_id,
  b.fee_type_name,
  b.fee_category,
  b.description,
  b.amount,
  b.waived_amount,
  b.paid,
  b.balance,
  b.due_date,
  b.payment_status,
  pta.display_name(s.last_name, s.first_name, s.middle_name, s.suffix) as student_name
from pta.portal_balance_rows() b
join pta.student_guardians sg
  on sg.student_id = b.student_id and sg.guardian_id = pta.current_guardian_id()
join pta.students s on s.id = b.student_id;

-- v_portal_payments — receipts the parent can actually show someone.
-- Voided payments are included and labelled rather than hidden: a parent who
-- was handed a receipt that was later voided needs to see that it was voided,
-- not watch it silently vanish.
create or replace view pta.v_portal_payments
with (security_invoker = off) as
select
  sg.guardian_id,
  p.id            as payment_id,
  p.school_id,
  p.student_id,
  p.receipt_number,
  p.payment_date,
  p.total_amount,
  p.payment_method,
  p.reference_number,
  p.status,
  pta.display_name(s.last_name, s.first_name, s.middle_name, s.suffix) as student_name
from pta.payments p
join pta.student_guardians sg on sg.student_id = p.student_id
join pta.students s on s.id = p.student_id
where sg.guardian_id = pta.current_guardian_id();

-- v_portal_claims — the parent's own submissions and where they stand.
create or replace view pta.v_portal_claims
with (security_invoker = off) as
select
  c.id,
  c.guardian_id,
  c.school_id,
  c.claim_type,
  c.student_id,
  c.program_id,
  c.claimed_amount,
  c.payment_method,
  c.reference_number,
  c.proof_path,
  c.status,
  c.review_reason,
  c.reviewed_at,
  c.created_at,
  c.payment_id,
  c.donation_id,
  pay.receipt_number,
  don.acknowledgement_number,
  case when c.student_id is null then null
       else pta.display_name(s.last_name, s.first_name, s.middle_name, s.suffix)
  end as student_name,
  prog.name as program_name
from pta.payment_claims c
left join pta.students s          on s.id    = c.student_id
left join pta.donation_programs prog on prog.id = c.program_id
left join pta.payments pay        on pay.id  = c.payment_id
left join pta.donations don       on don.id  = c.donation_id
where c.guardian_id = pta.current_guardian_id();

-- v_portal_programs — what a parent may give to. Open programs only, current
-- school year only. A closed program stays readable in reports (0014) but must
-- not appear on a form that would create a new donation against it.
create or replace view pta.v_portal_programs
with (security_invoker = off) as
select
  p.id,
  p.school_id,
  p.school_year_id,
  p.name,
  p.description,
  p.category,
  p.target_amount,
  p.accepts_pledges,
  p.accepts_in_kind,
  p.starts_on,
  p.ends_on,
  coalesce(g.raised, 0) as raised_cash
from pta.donation_programs p
join pta.school_years sy on sy.id = p.school_year_id and sy.is_active
left join lateral (
  select sum(d.amount) as raised
    from pta.donations d
   where d.program_id = p.id and d.status = 'posted' and d.kind = 'cash'
) g on true
where p.status = 'open'
  and p.school_id = pta.current_guardian_school_id();

-- v_portal_pledges — the parent's own promises, with fulfilment DERIVED
-- (D15 again -- donation_pledges has no stored fulfilled column and must not
-- grow one).
create or replace view pta.v_portal_pledges
with (security_invoker = off) as
select
  ps.id,
  ps.school_id,
  ps.program_id,
  ps.program_name,
  ps.pledged_amount,
  ps.fulfilled_amount,
  ps.remaining_amount,
  ps.fulfilment_status,
  ps.due_date,
  ps.status,
  ps.created_at,
  d.guardian_id
from pta.portal_pledge_rows() ps
join pta.donors d on d.id = ps.donor_id;

-- v_portal_account — the guardian's own account, minus everything secret.
--
-- portal_accounts is readable by nobody: not anon, not service_role, and not
-- the guardian it belongs to. But the portal still has to know whether the
-- bootstrap PIN is outstanding, or it cannot force the change it depends on.
--
-- So: masked card, a boolean, a locale, a lock timestamp. No pin_hash, no
-- pin_salt, no card_number. If you add a column here, ask first whether a
-- screenshot of this page in a group chat would matter.
create or replace view pta.v_portal_account
with (security_invoker = off) as
select
  a.id,
  a.school_id,
  a.guardian_id,
  '••••••••••••' || right(a.card_number, 4) as card_masked,
  a.must_change_pin,
  a.locale,
  a.locked_until,
  a.last_login_at,
  a.issued_at,
  s.name as school_name,
  -- The number a parent sends money to. school_settings is RLS-scoped to STAFF
  -- (0006), so a portal session reads nothing from it directly; surfacing it
  -- through this definer view is the only way the payment page can print it.
  --
  -- Tolerant of both shapes on purpose. /admin/settings writes a bare JSON
  -- string, but school_settings is a key/value table somebody will eventually
  -- hand-edit in the SQL editor, and {"number": "..."} is the guess they will
  -- make. Accepting either beats a payment page that silently prints nothing.
  (select coalesce(ss.value ->> 'number', ss.value #>> '{}')
     from pta.school_settings ss
    where ss.school_id = a.school_id and ss.key = 'gcash_number') as gcash_number,
  pta.display_name(g.last_name, g.first_name, g.middle_name, g.suffix) as guardian_name
from pta.portal_accounts a
join pta.schools s on s.id = a.school_id
join pta.parents_guardians g on g.id = a.guardian_id
where a.guardian_id = pta.current_guardian_id();

-- v_portal_telegram — everything the guide page needs to tell the parent the
-- truth about their own link status.
create or replace view pta.v_portal_telegram
with (security_invoker = off) as
select
  g.id                as guardian_id,
  g.school_id,
  g.telegram_chat_id is not null as is_linked,
  g.telegram_active,
  g.telegram_linked_at,
  (select count(*) from pta.student_guardians sg
    where sg.guardian_id = g.id and sg.notify) as notifying_children,
  (select count(*) from pta.student_guardians sg
    where sg.guardian_id = g.id)               as total_children,
  (select coalesce(ss.value ->> 'username', ss.value #>> '{}')
     from pta.school_settings ss
    where ss.school_id = g.school_id and ss.key = 'telegram_bot') as bot_username
from pta.parents_guardians g
where g.id = pta.current_guardian_id();

-- ---------------------------------------------------------------------------
-- The staff side of claims. security_invoker = ON, like every other staff view:
-- the review queue is ordinary tenant data and RLS should decide.
-- ---------------------------------------------------------------------------

create or replace view pta.v_payment_claims_detail
with (security_invoker = on) as
select
  c.*,
  pta.display_name(g.last_name, g.first_name, g.middle_name, g.suffix) as guardian_name,
  g.contact_number as guardian_contact,
  case when c.student_id is null then null
       else pta.display_name(s.last_name, s.first_name, s.middle_name, s.suffix)
  end as student_name,
  coalesce(en.student_number, s.lrn) as student_no,
  en.grade_level,
  sec.name  as section_name,
  prog.name as program_name,
  pay.receipt_number,
  don.acknowledgement_number,
  -- Surfaced so a reviewer is not the one who discovers, at approval time,
  -- that create_payment() is about to fail on the enrollment FK.
  (en.id is not null) as student_is_enrolled
from pta.payment_claims c
join pta.parents_guardians g on g.id = c.guardian_id
left join pta.students s on s.id = c.student_id
left join pta.student_enrollments en
       on en.student_id = c.student_id
      and en.school_year_id = c.school_year_id
      and en.status = 'enrolled'
left join pta.sections sec on sec.id = en.section_id
left join pta.donation_programs prog on prog.id = c.program_id
left join pta.payments  pay on pay.id = c.payment_id
left join pta.donations don on don.id = c.donation_id;

-- Staff view of issued parent cards. The card NUMBER is deliberately absent:
-- it is a credential, the office only ever needs to identify a card to revoke
-- or reset it, and a list screen that prints it is a list screen somebody
-- photographs. Issuance returns it exactly once, to the person issuing.
-- security_invoker = OFF, like the portal views and for the mirror-image
-- reason. An invoker view here would need the caller to hold SELECT on
-- pta.portal_accounts, and RLS is ROW-level: any policy that lets a cashier see
-- the row lets them see card_number and pin_hash in it. So the table is
-- readable by nobody at all, and this view -- scoped to the caller's schools
-- and masking the number -- is the only window onto it.
create or replace view pta.v_parent_cards_detail
with (security_invoker = off) as
select
  a.id,
  a.school_id,
  a.guardian_id,
  '••••••••••••' || right(a.card_number, 4) as card_masked,
  a.status,
  a.must_change_pin,
  a.locked_until,
  a.last_login_at,
  a.issued_at,
  a.revoked_at,
  a.locale,
  pta.display_name(g.last_name, g.first_name, g.middle_name, g.suffix) as guardian_name,
  g.contact_number,
  g.telegram_chat_id is not null as telegram_linked,
  (select count(*) from pta.student_guardians sg where sg.guardian_id = a.guardian_id) as children
from pta.portal_accounts a
join pta.parents_guardians g on g.id = a.guardian_id
where a.school_id = any (pta.current_school_ids());

-- Guardians with no card yet — the issuance queue.
create or replace view pta.v_parent_cards_pending
with (security_invoker = on) as
select
  g.id as guardian_id,
  g.school_id,
  pta.display_name(g.last_name, g.first_name, g.middle_name, g.suffix) as guardian_name,
  g.contact_number,
  (select count(*) from pta.student_guardians sg where sg.guardian_id = g.id) as children
from pta.parents_guardians g
where not exists (select 1 from pta.portal_accounts a where a.guardian_id = g.id)
  and exists (select 1 from pta.student_guardians sg where sg.guardian_id = g.id);

-- ===========================================================================
-- 7. RLS
--
-- Same shape as the rest of the project (0006): tenant reads scoped by
-- current_school_ids(), config writes gated on a role, and machine-written
-- tables get NO write policy at all -- their only writers are the definer
-- functions below, exactly as payments has always worked (D3).
--
-- portal_accounts and portal_login_attempts have NO read policy for the
-- guardian either. A parent never needs to SELECT their own hash.
-- ===========================================================================

alter table pta.portal_accounts       enable row level security;
alter table pta.portal_accounts       force  row level security;
alter table pta.portal_login_attempts enable row level security;
alter table pta.portal_login_attempts force  row level security;
alter table pta.payment_claims        enable row level security;
alter table pta.payment_claims        force  row level security;

-- portal_accounts has NO POLICY AT ALL -- not even a read.
--
-- RLS is row-level: a policy letting a cashier see their school's rows would
-- let them see card_number and pin_hash inside those rows, and a cashier reads
-- card numbers off the POS scanner all day already. Staff go through
-- pta.v_parent_cards_detail, which is a definer view that masks the number;
-- the POS goes through pta.lookup_parent_card(), which returns children and
-- never the credential. The three writers are issue_parent_card(),
-- revoke_parent_card() and reset_parent_pin().

drop policy if exists payment_claims_read on pta.payment_claims;
create policy payment_claims_read on pta.payment_claims
  for select to authenticated
  using (school_id = any (pta.current_school_ids()));

-- No write policy: submit / approve / reject are the only writers.
-- portal_login_attempts gets no policy at all; only the login function touches it.

-- ===========================================================================
-- 8. Login
-- ===========================================================================

-- portal_login(card_number, pin, ip) -> jsonb
--
-- Returns an identity, never a hash. TypeScript's job afterwards is only to
-- sign a JWT carrying guardian_id; every authorization decision downstream is
-- made in SQL by current_guardian_id().
--
-- Failure modes are deliberately NOT distinguished to the caller beyond what a
-- parent needs to act: a wrong card and a wrong PIN both return 'invalid', so
-- the endpoint cannot be used to test whether a card number exists.
create or replace function pta.portal_login(
  p_card_number text,
  p_pin         text,
  p_ip          text default 'unknown'
) returns jsonb
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
declare
  acct      pta.portal_accounts%rowtype;
  v_card    text;
  v_ip_hits int;
  v_school  record;
begin
  v_card := regexp_replace(coalesce(p_card_number, ''), '[^0-9]', '', 'g');

  -- Housekeeping first, so the table cannot grow without bound.
  delete from pta.portal_login_attempts where attempted_at < now() - interval '1 day';

  -- IP throttle. This is the half that catches someone GUESSING card numbers:
  -- a wrong card matches no account, so it would otherwise increment nothing.
  select count(*) into v_ip_hits
    from pta.portal_login_attempts
   where ip = p_ip
     and not succeeded
     and attempted_at > now() - interval '15 minutes';

  if v_ip_hits >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'throttled');
  end if;

  if length(v_card) <> 16 or not pta.luhn_ok(v_card) then
    insert into pta.portal_login_attempts (ip, card_number) values (p_ip, v_card);
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  select * into acct from pta.portal_accounts where card_number = v_card;

  if not found or acct.status <> 'active' then
    insert into pta.portal_login_attempts (ip, card_number) values (p_ip, v_card);
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  if acct.locked_until is not null and acct.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked',
                              'locked_until', acct.locked_until);
  end if;

  if pta.portal_hash_pin(coalesce(p_pin, ''), acct.pin_salt) <> acct.pin_hash then
    update pta.portal_accounts
       set failed_attempts = failed_attempts + 1,
           locked_until = case when failed_attempts + 1 >= 5
                               then now() + interval '15 minutes' else locked_until end
     where id = acct.id
    returning * into acct;

    insert into pta.portal_login_attempts (ip, card_number) values (p_ip, v_card);

    if acct.locked_until is not null and acct.locked_until > now() then
      -- Audited: a parent locked out by a neighbour with a grudge should be
      -- diagnosable rather than mysterious.
      insert into pta.audit_logs (school_id, action, entity_type, entity_id, new_values)
      values (acct.school_id, 'PORTAL_LOCKED_OUT', 'portal_account', acct.id,
              jsonb_build_object('locked_until', acct.locked_until));
      return jsonb_build_object('ok', false, 'reason', 'locked',
                                'locked_until', acct.locked_until);
    end if;

    return jsonb_build_object('ok', false, 'reason', 'invalid',
                              'attempts_left', greatest(5 - acct.failed_attempts, 0));
  end if;

  -- Success.
  update pta.portal_accounts
     set failed_attempts = 0, locked_until = null, last_login_at = now()
   where id = acct.id;

  insert into pta.portal_login_attempts (ip, card_number, succeeded)
  values (p_ip, v_card, true);

  select s.id, s.name, s.school_code into v_school
    from pta.schools s where s.id = acct.school_id;

  return jsonb_build_object(
    'ok',              true,
    'guardian_id',     acct.guardian_id,
    'account_id',      acct.id,
    'school_id',       acct.school_id,
    'school_name',     v_school.name,
    'locale',          acct.locale,
    'must_change_pin', acct.must_change_pin
  );
end;
$$;

-- portal_change_pin(old, new) -> jsonb
-- Called with a portal JWT. Clears must_change_pin, which is how the initial
-- office-issued PIN stops being usable.
create or replace function pta.portal_change_pin(p_old_pin text, p_new_pin text)
returns jsonb
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
declare
  acct     pta.portal_accounts%rowtype;
  v_salt   text;
  v_gid    uuid := pta.current_guardian_id();
begin
  if v_gid is null then
    raise exception 'Not a portal session.' using errcode = '42501';
  end if;

  select * into acct from pta.portal_accounts where guardian_id = v_gid;

  if pta.portal_hash_pin(coalesce(p_old_pin, ''), acct.pin_salt) <> acct.pin_hash then
    return jsonb_build_object('ok', false, 'reason', 'wrong_pin');
  end if;
  if p_new_pin !~ '^[0-9]{6}$' then
    return jsonb_build_object('ok', false, 'reason', 'format');
  end if;
  -- Refusing the obvious ones is worth the four lines: a PIN chosen under
  -- pressure at a counter is '123456' more often than chance allows.
  if p_new_pin in ('123456', '000000', '111111', '654321', '121212') then
    return jsonb_build_object('ok', false, 'reason', 'too_common');
  end if;

  v_salt := replace(gen_random_uuid()::text, '-', '');

  update pta.portal_accounts
     set pin_salt = v_salt,
         pin_hash = pta.portal_hash_pin(p_new_pin, v_salt),
         must_change_pin = false,
         failed_attempts = 0,
         locked_until = null
   where id = acct.id;

  insert into pta.audit_logs (school_id, action, entity_type, entity_id)
  values (acct.school_id, 'PORTAL_PIN_SET', 'portal_account', acct.id);

  return jsonb_build_object('ok', true);
end;
$$;

-- ===========================================================================
-- 9. Card issuance — staff side
-- ===========================================================================

-- issue_parent_card(guardian_id) -> jsonb {card_number, pin}
--
-- Returns the card number and initial PIN EXACTLY ONCE, to the staff member
-- issuing it. Neither is ever readable again: v_parent_cards_detail masks the
-- number and there is no way back from the hash. Losing the slip means
-- reset_parent_pin(), which is the correct amount of friction.
create or replace function pta.issue_parent_card(p_guardian_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
declare
  v_school uuid;
  v_card   text;
  v_pin    text;
  v_salt   text;
  v_id     uuid;
  v_tries  int := 0;
begin
  select school_id into v_school from pta.parents_guardians where id = p_guardian_id;
  if not found then
    raise exception 'no such guardian: %', p_guardian_id using errcode = '23503';
  end if;

  perform pta.require_school_role(v_school, array['admin', 'treasurer']);

  if exists (select 1 from pta.portal_accounts where guardian_id = p_guardian_id) then
    raise exception 'This guardian already holds a parent card.' using errcode = '23505';
  end if;

  -- Globally unique across every school, so the login form stays one field.
  -- Collision at 10^15 is theoretical; the loop is here so that if it ever
  -- happens it is a retry rather than a failed issuance at a counter.
  loop
    v_card  := pta.generate_card_number();
    v_tries := v_tries + 1;
    exit when not exists (select 1 from pta.portal_accounts where card_number = v_card);
    if v_tries > 10 then
      raise exception 'Could not allocate a card number.' using errcode = '55000';
    end if;
  end loop;

  v_pin  := pta.generate_pin();
  v_salt := replace(gen_random_uuid()::text, '-', '');

  insert into pta.portal_accounts
    (school_id, guardian_id, card_number, pin_hash, pin_salt, must_change_pin, issued_by)
  values
    (v_school, p_guardian_id, v_card, pta.portal_hash_pin(v_pin, v_salt), v_salt, true,
     pta.current_profile_id())
  returning id into v_id;

  -- The audit row records THAT a card was issued and to whom. It does not
  -- record the number: audit_logs is readable by every member of the school.
  perform pta.write_audit(
    v_school, 'PORTAL_CARD_ISSUED', 'portal_account', v_id,
    null, jsonb_build_object('guardian_id', p_guardian_id, 'last4', right(v_card, 4))
  );

  return jsonb_build_object('ok', true, 'account_id', v_id,
                            'card_number', v_card, 'pin', v_pin);
end;
$$;

create or replace function pta.revoke_parent_card(p_account_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
declare
  acct pta.portal_accounts%rowtype;
begin
  select * into acct from pta.portal_accounts where id = p_account_id;
  if not found then
    raise exception 'no such parent card: %', p_account_id using errcode = '23503';
  end if;

  perform pta.require_school_role(acct.school_id, array['admin', 'treasurer']);

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A revocation reason is required.' using errcode = '22023';
  end if;

  if acct.status = 'revoked' then
    return;   -- idempotent: a double-click is not an error
  end if;

  update pta.portal_accounts
     set status = 'revoked', status_reason = p_reason, revoked_at = now()
   where id = p_account_id;

  -- current_guardian_id() re-checks status on every call, so any session
  -- already holding a valid JWT for this guardian stops resolving right here.
  perform pta.write_audit(
    acct.school_id, 'PORTAL_CARD_REVOKED', 'portal_account', p_account_id,
    jsonb_build_object('last4', right(acct.card_number, 4)),
    jsonb_build_object('reason', p_reason)
  );
end;
$$;

-- reset_parent_pin(account_id) -> jsonb {pin}
--
-- Staff-only, and deliberately so. The parent card's barcode is scanned at the
-- POS by cashiers in the course of normal work, so a "forgot my PIN" flow that
-- needed only the card number would hand every cashier a way into any parent's
-- account -- and into their children's movements. Resetting requires standing
-- in front of somebody.
create or replace function pta.reset_parent_pin(p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
declare
  acct   pta.portal_accounts%rowtype;
  v_pin  text;
  v_salt text;
begin
  select * into acct from pta.portal_accounts where id = p_account_id;
  if not found then
    raise exception 'no such parent card: %', p_account_id using errcode = '23503';
  end if;

  perform pta.require_school_role(acct.school_id, array['admin', 'treasurer']);

  v_pin  := pta.generate_pin();
  v_salt := replace(gen_random_uuid()::text, '-', '');

  update pta.portal_accounts
     set pin_hash = pta.portal_hash_pin(v_pin, v_salt),
         pin_salt = v_salt,
         must_change_pin = true,
         failed_attempts = 0,
         locked_until = null
   where id = p_account_id;

  perform pta.write_audit(
    acct.school_id, 'PORTAL_PIN_RESET', 'portal_account', p_account_id, null, null
  );

  return jsonb_build_object('ok', true, 'pin', v_pin);
end;
$$;

-- lookup_parent_card(card_number) -> the guardian's children
--
-- What the POS search box calls when a cashier scans a parent card. Returns
-- people, never the credential: no hash, no PIN state, not even the number that
-- was just scanned back again.
--
-- Scoped to the caller's own school even though card numbers are GLOBALLY
-- unique -- a cashier scanning another school's card gets nothing rather than a
-- cross-tenant name.
create or replace function pta.lookup_parent_card(p_card_number text)
returns table (
  guardian_id   uuid,
  guardian_name text,
  student_id    uuid,
  student_name  text,
  student_no    text,
  grade_level   text,
  section_name  text,
  outstanding   numeric
)
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
declare
  v_card    text;
  v_school  uuid;
  v_guardian uuid;
begin
  v_card := regexp_replace(coalesce(p_card_number, ''), '[^0-9]', '', 'g');
  if length(v_card) <> 16 or not pta.luhn_ok(v_card) then
    return;
  end if;

  select a.school_id, a.guardian_id into v_school, v_guardian
    from pta.portal_accounts a
   where a.card_number = v_card and a.status = 'active';

  if v_guardian is null then
    return;
  end if;

  -- The caller must be staff of the card's OWN school. Checked after the
  -- lookup, so a cashier at school B learns nothing about a card from school A
  -- beyond the empty result they would get for a made-up number.
  if not pta.has_school_role(v_school, array['admin', 'cashier', 'treasurer']) then
    return;
  end if;

  return query
  select
    g.id,
    pta.display_name(g.last_name, g.first_name, g.middle_name, g.suffix),
    s.id,
    pta.display_name(s.last_name, s.first_name, s.middle_name, s.suffix),
    coalesce(en.student_number, s.lrn),
    en.grade_level,
    sec.name,
    coalesce((select sum(b.balance) from pta.v_student_charge_balances b
               where b.student_id = s.id and b.status <> 'cancelled'), 0)
  from pta.student_guardians sg
  join pta.parents_guardians g on g.id = sg.guardian_id
  join pta.students s on s.id = sg.student_id
  left join pta.school_years sy on sy.school_id = s.school_id and sy.is_active
  left join pta.student_enrollments en
         on en.student_id = s.id and en.school_year_id = sy.id and en.status = 'enrolled'
  left join pta.sections sec on sec.id = en.section_id
  where sg.guardian_id = v_guardian
  order by 4;
end;
$$;

-- ===========================================================================
-- 10. Claims
-- ===========================================================================

-- submit_payment_claim(...) -> uuid
--
-- The parent's write verb. Everything it validates, it validates HERE rather
-- than at review, because a claim that fails at review has already cost the
-- parent a transfer and three days of waiting.
create or replace function pta.submit_payment_claim(
  p_claim_type       text,
  p_student_id       uuid,
  p_program_id       uuid,
  p_items            jsonb,
  p_claimed_amount   numeric,
  p_payment_method   text,
  p_reference_number text,
  p_proof_path       text default null,
  p_is_anonymous     boolean default false,
  p_remarks          text default null
) returns uuid
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
declare
  v_gid     uuid := pta.current_guardian_id();
  v_school  uuid;
  v_sy      uuid;
  v_id      uuid;
  v_item    record;
  v_sum     numeric(12,2) := 0;
begin
  if v_gid is null then
    raise exception 'Not a portal session.' using errcode = '42501';
  end if;

  v_school := pta.current_guardian_school_id();

  select id into v_sy from pta.school_years
   where school_id = v_school and is_active limit 1;
  if v_sy is null then
    raise exception 'This school has no active school year.' using errcode = '22023';
  end if;

  if p_reference_number is null or length(trim(p_reference_number)) < 4 then
    raise exception 'A transaction reference number is required.' using errcode = '22023';
  end if;

  if p_claim_type = 'fee' then
    -- The child must be this guardian's child. Not "a child at this school".
    if not exists (
      select 1 from pta.student_guardians sg
       where sg.guardian_id = v_gid and sg.student_id = p_student_id
    ) then
      raise exception 'That student is not linked to you.' using errcode = '42501';
    end if;

    -- pta.payments carries an FK to student_enrollments, so approving a claim
    -- for a student with no active enrollment would fail INSIDE create_payment,
    -- after the parent had already sent money. Refuse it now, in words.
    if not exists (
      select 1 from pta.student_enrollments en
       where en.student_id = p_student_id
         and en.school_year_id = v_sy
         and en.status = 'enrolled'
    ) then
      raise exception 'This student is not enrolled for the current school year. Please settle at the school office.'
        using errcode = '22023';
    end if;

    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
      raise exception 'Select at least one fee to pay.' using errcode = '22023';
    end if;

    for v_item in
      select (e ->> 'charge_id')::uuid as charge_id, (e ->> 'amount')::numeric as amount
        from jsonb_array_elements(p_items) e
    loop
      if v_item.amount is null or v_item.amount <= 0 then
        raise exception 'Every line must carry a positive amount.' using errcode = '22023';
      end if;
      -- Charge must belong to THIS student, and not be over-paid. The same
      -- guard create_payment applies, applied early so the parent sees it.
      if not exists (
        select 1 from pta.v_student_charge_balances b
         where b.id = v_item.charge_id
           and b.student_id = p_student_id
           and b.balance >= v_item.amount
      ) then   -- definer context: this view resolves as the owner, unlike in a view
        raise exception 'One of the selected fees is not payable at that amount.'
          using errcode = '22023';
      end if;
      v_sum := v_sum + v_item.amount;
    end loop;

    if v_sum <> p_claimed_amount then
      raise exception 'The total does not match the selected fees.' using errcode = '22023';
    end if;

  elsif p_claim_type = 'donation' then
    if not exists (
      select 1 from pta.donation_programs p
       where p.id = p_program_id and p.school_id = v_school
         and p.status = 'open' and p.school_year_id = v_sy
    ) then
      raise exception 'That program is not open for donations.' using errcode = '22023';
    end if;
    if p_claimed_amount is null or p_claimed_amount <= 0 then
      raise exception 'A donation amount is required.' using errcode = '22023';
    end if;
  else
    raise exception 'Unknown claim type: %', p_claim_type using errcode = '22023';
  end if;

  insert into pta.payment_claims (
    school_id, guardian_id, school_year_id, claim_type,
    student_id, program_id, items, claimed_amount,
    payment_method, reference_number, proof_path, is_anonymous, remarks
  ) values (
    v_school, v_gid, v_sy, p_claim_type,
    case when p_claim_type = 'fee' then p_student_id end,
    case when p_claim_type = 'donation' then p_program_id end,
    case when p_claim_type = 'fee' then p_items end,
    p_claimed_amount,
    coalesce(p_payment_method, 'gcash'), btrim(p_reference_number),
    p_proof_path, coalesce(p_is_anonymous, false), p_remarks
  )
  returning id into v_id;

  insert into pta.audit_logs (school_id, action, entity_type, entity_id, new_values)
  values (v_school, 'CLAIM_SUBMITTED', 'payment_claim', v_id,
          jsonb_build_object('guardian_id', v_gid, 'amount', p_claimed_amount,
                             'type', p_claim_type));

  return v_id;
end;
$$;

-- approve_payment_claim(claim_id) -> jsonb
--
-- The moment money becomes real. Calls the EXISTING create_payment() /
-- record_donation() so a portal payment is indistinguishable downstream from
-- one taken at the counter -- same receipt series, same balance view, same
-- daily report. collected_by / received_by is the REVIEWER, because they are
-- the person attesting that the transfer landed.
create or replace function pta.approve_payment_claim(p_claim_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
declare
  c        pta.payment_claims%rowtype;
  v_pay    record;
  v_don    uuid;
  v_donor  uuid;
  v_result jsonb;
begin
  select * into c from pta.payment_claims where id = p_claim_id for update;
  if not found then
    raise exception 'no such claim: %', p_claim_id using errcode = '23503';
  end if;

  perform pta.require_school_role(c.school_id, array['admin', 'cashier', 'treasurer']);

  if c.status <> 'submitted' then
    raise exception 'This claim has already been %.', c.status using errcode = '22023';
  end if;

  if c.claim_type = 'fee' then
    select * into v_pay from pta.create_payment(
      p_school_id        => c.school_id,
      p_student_id       => c.student_id,
      p_school_year_id   => c.school_year_id,
      p_payment_method   => c.payment_method,
      p_items            => c.items,
      p_reference_number => c.reference_number,
      p_remarks          => coalesce(c.remarks, '')
                              || ' [portal claim ' || left(c.id::text, 8) || ']',
      -- Idempotent on the CLAIM, so a double-clicked Approve cannot mint two
      -- receipts for one transfer.
      p_idempotency_key  => 'claim:' || c.id::text
    );

    update pta.payment_claims
       set status = 'approved', reviewed_by = pta.current_profile_id(),
           reviewed_at = now(), payment_id = v_pay.payment_id
     where id = p_claim_id;

    v_result := jsonb_build_object('ok', true, 'payment_id', v_pay.payment_id,
                                   'receipt_number', v_pay.receipt_number);
  else
    -- A parent giving to the PTA becomes a donor row on their FIRST approved
    -- gift, created by staff here rather than self-created from the portal:
    -- donors is a directory, and 0014 keeps it an ordinary staff-written one.
    select id into v_donor from pta.donors
     where school_id = c.school_id and guardian_id = c.guardian_id;

    if v_donor is null then
      -- Named notation deliberately: upsert_donor takes eight arguments, six of
      -- them text or uuid, and a positional call that silently transposes two of
      -- them creates a donor named 'guardian'.
      v_donor := pta.upsert_donor(
        p_school_id      => c.school_id,
        p_display_name   => (select pta.display_name(g.last_name, g.first_name,
                                                     g.middle_name, g.suffix)
                               from pta.parents_guardians g where g.id = c.guardian_id),
        p_donor_type     => 'guardian',
        p_guardian_id    => c.guardian_id,
        p_contact_number => (select contact_number from pta.parents_guardians
                              where id = c.guardian_id)
      );
    end if;

    select d.donation_id into v_don from pta.record_donation(
      p_school_id        => c.school_id,
      p_school_year_id   => c.school_year_id,
      p_program_id       => c.program_id,
      p_kind             => 'cash',
      p_amount           => c.claimed_amount,
      p_payment_method   => c.payment_method,
      p_donor_id         => v_donor,
      p_is_anonymous     => c.is_anonymous,
      p_reference_number => c.reference_number,
      p_remarks          => coalesce(c.remarks, '')
                              || ' [portal claim ' || left(c.id::text, 8) || ']',
      p_idempotency_key  => 'claim:' || c.id::text
    ) d;

    update pta.payment_claims
       set status = 'approved', reviewed_by = pta.current_profile_id(),
           reviewed_at = now(), donation_id = v_don
     where id = p_claim_id;

    v_result := jsonb_build_object('ok', true, 'donation_id', v_don);
  end if;

  perform pta.write_audit(
    c.school_id, 'CLAIM_APPROVED', 'payment_claim', p_claim_id,
    null, v_result
  );

  return v_result;
end;
$$;

create or replace function pta.reject_payment_claim(p_claim_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
declare
  c pta.payment_claims%rowtype;
begin
  select * into c from pta.payment_claims where id = p_claim_id for update;
  if not found then
    raise exception 'no such claim: %', p_claim_id using errcode = '23503';
  end if;

  perform pta.require_school_role(c.school_id, array['admin', 'cashier', 'treasurer']);

  if c.status <> 'submitted' then
    raise exception 'This claim has already been %.', c.status using errcode = '22023';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A reason is required so the parent knows what to fix.'
      using errcode = '22023';
  end if;

  update pta.payment_claims
     set status = 'rejected', reviewed_by = pta.current_profile_id(),
         reviewed_at = now(), review_reason = p_reason
   where id = p_claim_id;

  perform pta.write_audit(
    c.school_id, 'CLAIM_REJECTED', 'payment_claim', p_claim_id,
    null, jsonb_build_object('reason', p_reason)
  );
end;
$$;

-- ===========================================================================
-- 11. Pledges from the portal
--
-- A pledge moves no money, so it needs no review queue. 0014 deliberately left
-- pledges with no overpayment guard -- over-delivering on a promise is
-- generosity -- and this verb inherits that.
-- ===========================================================================

create or replace function pta.portal_create_pledge(
  p_program_id uuid,
  p_amount     numeric,
  p_due_date   date default null,
  p_notes      text default null
) returns uuid
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
declare
  v_gid    uuid := pta.current_guardian_id();
  v_school uuid;
  v_sy     uuid;
  v_donor  uuid;
  v_id     uuid;
begin
  if v_gid is null then
    raise exception 'Not a portal session.' using errcode = '42501';
  end if;

  v_school := pta.current_guardian_school_id();

  select id into v_sy from pta.school_years
   where school_id = v_school and is_active limit 1;

  if not exists (
    select 1 from pta.donation_programs p
     where p.id = p_program_id and p.school_id = v_school
       and p.status = 'open' and p.accepts_pledges
  ) then
    raise exception 'That program is not accepting pledges.' using errcode = '22023';
  end if;

  select id into v_donor from pta.donors
   where school_id = v_school and guardian_id = v_gid;

  if v_donor is null then
    -- NOT upsert_donor(): that verb begins with require_school_role(admin,
    -- cashier, treasurer), and a parent is none of those. The row is inserted
    -- here instead, from a guardian record that staff already curate -- the
    -- parent supplies no free text, so this is still not self-service directory
    -- editing. Donations go the other way: their donor row is created by the
    -- REVIEWER in approve_payment_claim(), because a gift is staff-verified.
    insert into pta.donors (school_id, donor_type, display_name, guardian_id, contact_number)
    select v_school, 'guardian',
           pta.display_name(g.last_name, g.first_name, g.middle_name, g.suffix),
           g.id, g.contact_number
      from pta.parents_guardians g
     where g.id = v_gid
    returning id into v_donor;
  end if;

  insert into pta.donation_pledges
    (school_id, school_year_id, program_id, donor_id, pledged_amount, due_date, notes)
  values
    (v_school, v_sy, p_program_id, v_donor, p_amount, p_due_date, p_notes)
  returning id into v_id;

  return v_id;
end;
$$;

-- ===========================================================================
-- 12. Telegram — the fix to 0013, and the portal's own linking verb
-- ===========================================================================

-- THE 0013 HOLE, CLOSED.
--
-- issue_enroll_token() was granted to `authenticated` with no authorization
-- check at all. Harmless while only staff held such a token; the moment a
-- portal guardian does, any parent could mint an enrolment link for any student
-- in any school. The signature gains p_guardian_id, and the body gains the
-- check it always needed.
--
-- p_guardian_id is what makes the portal flow possible at all: without it,
-- redeem_enroll_token() invents a NEW parents_guardians row from the Telegram
-- display name, so the parent logged into the portal and the parent receiving
-- bot messages would be two different rows for one human -- the portal saying
-- "not linked" forever while the bot cheerfully messaged a duplicate.
-- The 3-arg overload from 0013 must GO, not merely be shadowed. Left in place it
-- would still be callable -- with no authorization check whatsoever -- and a
-- 3-argument call would additionally be ambiguous against the new default.
-- Dropping it is what actually closes the hole described above.
drop function if exists pta.issue_enroll_token(uuid, text, interval);

create or replace function pta.issue_enroll_token(
  p_student_id   uuid,
  p_relationship text default 'Guardian',
  p_valid_for    interval default interval '30 days',
  p_guardian_id  uuid default null
) returns text
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
declare
  v_token  text;
  v_school uuid;
begin
  select school_id into v_school from pta.students where id = p_student_id;
  if not found then
    raise exception 'no such student: %', p_student_id using errcode = '23503';
  end if;

  -- Staff of that school, OR the guardian of that very child asking for their
  -- own link. Nothing else. service_role still passes, for the gate board.
  if not (
       pta.has_school_role(v_school, array['admin', 'cashier', 'treasurer'])
    or (p_guardian_id is not null
        and p_guardian_id = pta.current_guardian_id()
        and exists (select 1 from pta.student_guardians sg
                     where sg.guardian_id = p_guardian_id
                       and sg.student_id  = p_student_id))
    or current_setting('role', true) = 'service_role'
  ) then
    raise exception 'Not authorized to issue an enrolment token for this student.'
      using errcode = '42501';
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '');

  insert into pta.guardian_enroll_tokens
    (token, school_id, student_id, relationship, expires_at, guardian_id)
  values
    (v_token, v_school, p_student_id, coalesce(p_relationship, 'Guardian'),
     now() + p_valid_for, p_guardian_id);

  return v_token;
end;
$$;

-- portal_issue_enroll_token() -> jsonb
--
-- The portal's own linking button. Three differences from the office slip, all
-- because the link is now a URL on a screen rather than paper handed to a named
-- person:
--
--   * 15 MINUTES, not 30 days. The parent taps it within seconds of pressing
--     the button. A token that outlives the page is a live credential lying
--     around, and whoever redeems it starts receiving a child's arrival photos.
--   * Bound to THIS guardian, so redemption links the existing row instead of
--     minting a duplicate.
--   * Audited, and rate-limited to one live token at a time -- pressing the
--     button repeatedly should not scatter credentials.
--
-- One token covers EVERY child of this guardian (see redeem_enroll_token
-- below), so a parent with three children taps once, not three times.
create or replace function pta.portal_issue_enroll_token()
returns jsonb
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
declare
  v_gid     uuid := pta.current_guardian_id();
  v_school  uuid;
  v_student uuid;
  v_token   text;
  v_bot     text;
begin
  if v_gid is null then
    raise exception 'Not a portal session.' using errcode = '42501';
  end if;

  v_school := pta.current_guardian_school_id();

  select sg.student_id into v_student
    from pta.student_guardians sg
   where sg.guardian_id = v_gid
   order by sg.is_primary desc
   limit 1;

  if v_student is null then
    return jsonb_build_object('ok', false, 'reason', 'no_children');
  end if;

  -- Retire any token still live for this guardian, so pressing the button
  -- twice leaves one credential outstanding rather than two.
  update pta.guardian_enroll_tokens
     set expires_at = now()
   where guardian_id = v_gid and used_at is null and expires_at > now();

  v_token := pta.issue_enroll_token(v_student, 'Guardian', interval '15 minutes', v_gid);

  select coalesce(ss.value ->> 'username', ss.value #>> '{}') into v_bot
    from pta.school_settings ss
   where ss.school_id = v_school and ss.key = 'telegram_bot';

  insert into pta.audit_logs (school_id, action, entity_type, entity_id)
  values (v_school, 'PORTAL_TELEGRAM_TOKEN_ISSUED', 'parents_guardian', v_gid);

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'bot_username', v_bot,
    'deep_link', case when v_bot is null then null
                      else 'https://t.me/' || v_bot || '?start=' || v_token end,
    'expires_at', now() + interval '15 minutes'
  );
end;
$$;

-- redeem_enroll_token — now guardian-aware.
--
-- When the token carries a guardian_id (portal-issued), bind the chat to THAT
-- person and link EVERY child of theirs in one redemption. When it does not
-- (an office slip), behave exactly as 0013 did: find-or-create by chat_id and
-- link the token's single student. Both paths still scope to the token's
-- school, which is what stops a chat_id linked at school A being reused as an
-- identity at school B.
create or replace function pta.redeem_enroll_token(
  p_token        text,
  p_chat_id      text,
  p_display_name text
) returns jsonb
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
declare
  tok        record;
  v_guardian uuid;
  v_student  record;
  v_name     text;
  v_first    text;
  v_last     text;
  v_count    int := 0;
begin
  select * into tok
    from pta.guardian_enroll_tokens
   where token = p_token
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_token');
  end if;
  if tok.used_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_used');
  end if;
  if tok.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  if tok.guardian_id is not null then
    -- PORTAL PATH. The person is already on file and already authenticated;
    -- we are only attaching a chat_id to them. No row is invented, so the
    -- portal and the bot cannot disagree about who this parent is.
    v_guardian := tok.guardian_id;

    update pta.parents_guardians
       set telegram_chat_id   = p_chat_id,
           telegram_active    = true,
           telegram_linked_at = coalesce(telegram_linked_at, now())
     where id = v_guardian;

    -- One tap covers the whole family.
    update pta.student_guardians
       set notify = true
     where guardian_id = v_guardian;

    select count(*) into v_count
      from pta.student_guardians where guardian_id = v_guardian;
  else
    -- OFFICE-SLIP PATH. Unchanged from 0013.
    v_name  := coalesce(nullif(btrim(p_display_name), ''), 'Guardian');
    v_last  := coalesce((regexp_match(v_name, '(\S+)$'))[1], v_name);
    v_first := coalesce(nullif(btrim(regexp_replace(v_name, '\s+\S+$', '')), ''), v_name);

    select id into v_guardian
      from pta.parents_guardians
     where school_id = tok.school_id
       and telegram_chat_id = p_chat_id;

    if v_guardian is null then
      insert into pta.parents_guardians
        (school_id, first_name, last_name, telegram_chat_id, telegram_active, telegram_linked_at)
      values
        (tok.school_id, v_first, v_last, p_chat_id, true, now())
      returning id into v_guardian;
    else
      update pta.parents_guardians
         set telegram_active    = true,
             telegram_linked_at = coalesce(telegram_linked_at, now())
       where id = v_guardian;
    end if;

    insert into pta.student_guardians
      (school_id, student_id, guardian_id, relationship, notify)
    values
      (tok.school_id, tok.student_id, v_guardian, tok.relationship, true)
    on conflict (student_id, guardian_id) do update set notify = true;

    v_count := 1;
  end if;

  update pta.guardian_enroll_tokens
     set used_at = now(), guardian_id = v_guardian
   where token = p_token;

  select pta.display_name(s.last_name, s.first_name, s.middle_name, s.suffix) as name,
         coalesce(e.student_number, s.lrn) as no
    into v_student
    from pta.students s
    left join pta.student_enrollments e on e.student_id = s.id
   where s.id = tok.student_id
   limit 1;

  return jsonb_build_object(
    'ok', true,
    'guardian_id',  v_guardian,
    'student_name', v_student.name,
    'student_no',   v_student.no,
    'children',     v_count
  );
end;
$$;

-- The portal's own notification switch. 0013's set_notify_preference() is keyed
-- by chat_id and granted to service_role only, because the bot is what calls
-- it; a parent pressing a toggle in the portal is a different caller entirely.
create or replace function pta.portal_set_notify(p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
declare
  v_gid uuid := pta.current_guardian_id();
begin
  if v_gid is null then
    raise exception 'Not a portal session.' using errcode = '42501';
  end if;

  update pta.parents_guardians set telegram_active = p_on where id = v_gid;
  update pta.student_guardians  set notify = p_on where guardian_id = v_gid;

  return jsonb_build_object('ok', true, 'notify', p_on);
end;
$$;

-- Unlink. The containment for a forwarded deep link: a parent who sees a name
-- that is not theirs on the guide page can cut it themselves at 9pm, rather
-- than waiting for the office to open.
create or replace function pta.portal_unlink_telegram()
returns jsonb
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
declare
  v_gid uuid := pta.current_guardian_id();
begin
  if v_gid is null then
    raise exception 'Not a portal session.' using errcode = '42501';
  end if;

  update pta.parents_guardians
     set telegram_chat_id = null, telegram_active = false, telegram_linked_at = null
   where id = v_gid;
  update pta.student_guardians set notify = false where guardian_id = v_gid;

  insert into pta.audit_logs (school_id, action, entity_type, entity_id)
  values (pta.current_guardian_school_id(), 'PORTAL_TELEGRAM_UNLINKED',
          'parents_guardian', v_gid);

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function pta.portal_set_locale(p_locale text)
returns void
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
begin
  if p_locale not in ('en', 'tl') then
    raise exception 'Unsupported locale: %', p_locale using errcode = '22023';
  end if;
  update pta.portal_accounts
     set locale = p_locale
   where guardian_id = pta.current_guardian_id();
end;
$$;

-- ===========================================================================
-- 13. Gate capture photos
--
-- The bucket `gate-captures` was created by 0013 as private with NO policies at
-- all: only service_role reads it, and the notifier mints a signed URL per
-- Telegram message. The portal holds no service_role key and never will.
--
-- So the guardianship check happens here, in `pta`, where the rest of the
-- authorization lives, and the ONE storage policy added below simply asks this
-- function. The join it would otherwise have to write -- object name ->
-- attendance -> student_cards -> student_guardians -- has no business living
-- inside a policy on a table shared with construction-saas and sms-demo.
--
-- Primary guardians only, matching v_portal_attendance: the 7-day guardians get
-- times, not pictures.
-- ===========================================================================

create or replace function pta.may_view_capture(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = pta, public
as $$
  select exists (
    select 1
      from pta.attendance a
      join pta.student_cards c
        on c.school_id = a.school_id
       and c.card_uid  = a.card_uid
       and a.scanned_at >= c.issued_at
       and (c.revoked_at is null or a.scanned_at < c.revoked_at)
      join pta.student_guardians sg
        on sg.student_id = c.student_id
     where a.image_path = p_object_name
       and sg.guardian_id = pta.current_guardian_id()
       and sg.is_primary
  );
$$;

drop policy if exists "gate_captures_guardian_read" on storage.objects;
create policy "gate_captures_guardian_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'gate-captures' and pta.may_view_capture(name));

-- ---------------------------------------------------------------------------
-- Proof-of-payment uploads.
--
-- A separate bucket from gate-captures because it holds a different thing with
-- a different audience: screenshots of a family's banking app, read by staff
-- reviewing claims. Both policies are scoped `bucket_id = 'pta-payment-proofs'`
-- as CLAUDE.md requires of anything touching the shared storage.objects.
--
-- Path convention: {school_id}/{guardian_id}/{claim-ref}.{ext} -- following
-- 0011's logos, where the first segment is the tenant. Here the SECOND segment
-- is the guardian, which is what confines a parent to their own folder.
--
-- The parent needs a real insert grant. A "server-minted signed upload URL"
-- does not avoid this: minting one requires insert rights on the object itself,
-- and the only key in this request path is the anon key. So the write is a
-- policy -- a narrow one, matching on BOTH the school and the guardian, and
-- carrying no read: a parent uploads a screenshot and never browses the bucket.
--
-- Segments are compared as TEXT, not cast to uuid. A cast in a policy raises
-- rather than returning false, so an object whose name is not a uuid path would
-- error the whole query instead of simply matching nothing.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('pta-payment-proofs', 'pta-payment-proofs', false)
on conflict (id) do nothing;

drop policy if exists "pta_proofs_guardian_write" on storage.objects;
create policy "pta_proofs_guardian_write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pta-payment-proofs'
    and (storage.foldername(name))[1] = pta.current_guardian_school_id()::text
    and (storage.foldername(name))[2] = pta.current_guardian_id()::text
  );

drop policy if exists "pta_proofs_staff_read" on storage.objects;
create policy "pta_proofs_staff_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'pta-payment-proofs'
    and (storage.foldername(name))[1] = any (
      select unnest(pta.current_school_ids())::text
    )
  );

drop policy if exists "pta_proofs_staff_delete" on storage.objects;
create policy "pta_proofs_staff_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'pta-payment-proofs'
    and (storage.foldername(name))[1] = any (
      select unnest(pta.current_school_ids())::text
    )
    and pta.has_school_role((storage.foldername(name))[1]::uuid, array['admin'])
  );

-- ===========================================================================
-- 14. Grants
--
-- Nothing here is granted to service_role. The gate board holds that key and
-- has its own read surface from 0013; a board that can read a roster has no
-- business reading credentials or claims. 0015 made the same call and this
-- file keeps it.
-- ===========================================================================

grant select on
  pta.v_portal_account,
  pta.v_portal_children, pta.v_portal_attendance, pta.v_portal_balances,
  pta.v_portal_payments, pta.v_portal_claims, pta.v_portal_programs,
  pta.v_portal_pledges, pta.v_portal_telegram,
  pta.v_payment_claims_detail, pta.v_parent_cards_detail, pta.v_parent_cards_pending
to authenticated;

revoke all on
  pta.v_portal_account,
  pta.v_portal_children, pta.v_portal_attendance, pta.v_portal_balances,
  pta.v_portal_payments, pta.v_portal_claims, pta.v_portal_programs,
  pta.v_portal_pledges, pta.v_portal_telegram,
  pta.v_payment_claims_detail, pta.v_parent_cards_detail, pta.v_parent_cards_pending
from anon;

revoke all on pta.portal_accounts, pta.portal_login_attempts, pta.payment_claims
  from anon, service_role;

revoke all on function pta.portal_hash_pin(text, text)          from public;
revoke all on function pta.lookup_parent_card(text)              from public;
revoke all on function pta.generate_card_number()               from public;
revoke all on function pta.generate_pin()                       from public;
revoke all on function pta.portal_login(text, text, text)       from public;
revoke all on function pta.portal_change_pin(text, text)        from public;
revoke all on function pta.issue_parent_card(uuid)              from public;
revoke all on function pta.revoke_parent_card(uuid, text)       from public;
revoke all on function pta.reset_parent_pin(uuid)               from public;
revoke all on function pta.submit_payment_claim(text, uuid, uuid, jsonb, numeric, text, text, text, boolean, text) from public;
revoke all on function pta.approve_payment_claim(uuid)          from public;
revoke all on function pta.reject_payment_claim(uuid, text)     from public;
revoke all on function pta.portal_create_pledge(uuid, numeric, date, text) from public;
revoke all on function pta.portal_issue_enroll_token()          from public;
revoke all on function pta.portal_set_notify(boolean)           from public;
revoke all on function pta.portal_unlink_telegram()             from public;
revoke all on function pta.portal_set_locale(text)              from public;
revoke all on function pta.portal_balance_rows()                from public;
revoke all on function pta.portal_attendance_rows()             from public;
revoke all on function pta.portal_pledge_rows()                 from public;
revoke all on function pta.current_guardian_id()                from public;
revoke all on function pta.current_guardian_school_id()         from public;
revoke all on function pta.may_view_capture(text)               from public;
revoke all on function pta.issue_enroll_token(uuid, text, interval, uuid) from public;

-- THE SECOND AND THIRD anon GRANTS IN THIS SCHEMA. See departure 4.
-- Logging in cannot require being logged in. Neither returns a hash, both are
-- rate limited, and anon still holds no table privilege anywhere in `pta`.
grant execute on function pta.portal_login(text, text, text) to anon, authenticated;

-- Portal session verbs. `authenticated` covers a portal JWT (role
-- 'authenticated', no auth.users row) as well as staff -- and every one of
-- these begins by resolving current_guardian_id(), which is null for staff.
grant execute on function pta.portal_change_pin(text, text)     to authenticated;
grant execute on function pta.portal_create_pledge(uuid, numeric, date, text) to authenticated;
grant execute on function pta.portal_issue_enroll_token()       to authenticated;
grant execute on function pta.portal_set_notify(boolean)        to authenticated;
grant execute on function pta.portal_unlink_telegram()          to authenticated;
grant execute on function pta.portal_set_locale(text)           to authenticated;
grant execute on function pta.portal_balance_rows()             to authenticated;
grant execute on function pta.portal_attendance_rows()          to authenticated;
grant execute on function pta.portal_pledge_rows()              to authenticated;
grant execute on function pta.current_guardian_id()             to authenticated;
grant execute on function pta.current_guardian_school_id()      to authenticated;
grant execute on function pta.may_view_capture(text)            to authenticated;
grant execute on function pta.submit_payment_claim(text, uuid, uuid, jsonb, numeric, text, text, text, boolean, text) to authenticated;

-- Staff verbs.
grant execute on function pta.lookup_parent_card(text)          to authenticated;
grant execute on function pta.issue_parent_card(uuid)           to authenticated;
grant execute on function pta.revoke_parent_card(uuid, text)    to authenticated;
grant execute on function pta.reset_parent_pin(uuid)            to authenticated;
grant execute on function pta.approve_payment_claim(uuid)       to authenticated;
grant execute on function pta.reject_payment_claim(uuid, text)  to authenticated;

-- Pure helpers, safe to expose to a logged-in caller.
grant execute on function pta.luhn_ok(text) to authenticated, anon;

-- Unchanged from 0013, re-granted because the signature changed.
grant execute on function pta.issue_enroll_token(uuid, text, interval, uuid)
  to service_role, authenticated;
