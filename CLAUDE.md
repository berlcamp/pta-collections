# PTA Collection Management System

Multi-tenant PTA collections for Philippine schools. A **school is a tenant**.
Built from `~/Desktop/Prompts/pta_collection_system_v2_claude_code_prompt.md`.

## Hard rules — read before touching anything

### The Supabase project is SHARED
Project `lvcbmopdstvupjpytjbb` also hosts **construction-saas** and **sms-demo**.
`auth.users`, `storage.objects`, the `public` schema and the Google OAuth config are
shared infrastructure. Treat everything outside the `pta` schema as third-party.

- **Never run `supabase db push`, `db reset`, or `db diff` against the remote.**
  They operate on the whole database and will propose dropping the other apps' objects.
  Production migrations are applied by hand, in order, via the Supabase SQL Editor.
- **Never add a trigger to `auth.users`.** A raising trigger there breaks signup for
  every app on the project. Provisioning is lazy, via `pta.claim_invite()`.
- **Never create anything in `public`.** Schema `pta` only.
- Every `storage.objects` policy must be scoped `bucket_id = 'pta-school-logos'`.

### `pta` has a second writer: the RFID attendance gate
`~/Documents/GithubBuilds/microcontrollers/esp32` — an ESP32 school-gate card reader,
its Next.js board, and two Edge Functions. It uses `pta.students`, `student_enrollments`
and `parents_guardians` as its roster instead of keeping its own, and adds
`gate_devices`, `student_cards`, `attendance`, `gate_notify_config`,
`gate_notifications` and `guardian_enroll_tokens` in **`0013_gate_attendance.sql`**.
Read that migration's header before changing any of them. Two things there break this
project's usual rules, deliberately:

- **`anon` holds `EXECUTE` on `pta.record_attendance(jsonb)`** — the one exception to
  `revoke all ... from anon`. The device's anon key is in readable flash, so it gets a
  single append-only verb and no table privileges at all.
- **`service_role` has SELECT on the tenant read surface** (students, enrollments,
  guardians, schools, ...) because the gate board reads with it. `service_role`
  BYPASSES RLS; that board scopes itself to one school in application code. Do not
  assume RLS is protecting tenant data from anything holding that key.

Three columns were added to existing tables for it: `telegram_chat_id` /
`telegram_active` / `telegram_linked_at` on `parents_guardians`, and `notify` on
`student_guardians`. `pta.students` also gained a `unique (id, school_id)` so gate
tables can carry a composite FK and never point a card at another school's student.

### This app has its own gate screens, under Super admin
`0015_gate_admin.sql` adds the read views and the two card verbs that
`/super/attendance` (live monitor) and `/super/cards` (card enrolment) run on:
`v_attendance_local`, `v_gate_device_status`, `v_unassigned_cards`,
`v_student_cards_detail`, plus `pta.assign_student_card()` and
`revoke_student_card()`.

- **None of it is granted to `service_role` or `anon`.** These reads go through
  the RLS-bound user client like every other page here; the ESP32 board keeps
  the separate, scoped-in-app-code surface 0013 gave it. Do not widen 0013's
  service_role grants to cover these.
- **Card binding is an RPC, not a table write.** 0013 left `student_cards` as an
  ordinary RLS write and the gate board does revoke-then-insert in two round
  trips. `assign_student_card()` makes that one transaction and writes
  `CARD_ASSIGNED` / `CARD_REVOKED` to the audit log — whose attendance a tap
  becomes is an identity decision (D3).
- **Revoking never deletes.** `revoked_at` is stamped so `attendance_resolved`
  keeps naming whoever genuinely held the card that day. Anything that would
  UPDATE a card's `student_id` in place rewrites history and is wrong.
- **`v_attendance_local` is to attendance what `v_payments_local` is to
  payments** (D11). Never bucket `scanned_at` by day in the browser.
- The gate pages are school-scoped by a `?school=` picker, not by the header
  switcher: a super admin arrives at `/super` with no active school (D2).

### Manual dashboard step
`pta` must be listed in Settings → API → Exposed schemas, or PostgREST returns 404
for every table.

### Donations are a SECOND money path — not fees
`0014_donations.sql` adds voluntary giving to PTA programs and activities:
`donation_programs`, `donors`, `donation_pledges`, `donations` and
`donation_receipt_counters`. Read that migration's header before touching them.
It runs parallel to the fee path and must stay that way:

- **A donation is never a `student_charge`.** It creates no charge, settles none,
  and needs no enrollment — an alumnus or a hardware store with no child in the
  school can give. Anything that would make a donation touch `student_charges`
  is the wrong shape; add to the donation path instead.
- **Separate receipt series.** Acknowledgements are `PREFIX-YYYY-D-000001` from
  `donation_receipt_counters`, never from `receipt_counters`. The printed
  document says ACKNOWLEDGEMENT, never OFFICIAL RECEIPT.
- **Cash and in-kind never sum into one figure.** In-kind carries an estimated
  peso value in the same `amount` column, separated everywhere by `kind`. Only
  the cash half reconciles against a drawer or a deposit.
- **Pledges have no stored fulfilled column** (D15 again). Fulfilment is derived
  in `pta.v_donation_pledge_status`. Unlike `create_payment`, there is
  deliberately no overpayment guard — over-delivering on a pledge is generosity.
- `donations` and `donation_pledges` have **no insert/update policy**. Their only
  writers are `pta.record_donation`, `void_donation`, `create_pledge`,
  `cancel_pledge` and `upsert_donor`. Programs and donors are ordinary
  RLS-bound table writes, being a catalogue and a directory.
- The gate board's `service_role` grants are **not** extended to any of it.

### The Parent/Guardian Portal is a SECOND identity system
`0016_parent_portal.sql` adds `/portal/*` — a barcode card and a PIN that let a
parent see their own children's gate attendance and fee balances, send a GCash
payment for confirmation, and give to PTA programs. It adds `portal_accounts`,
`portal_login_attempts` and `payment_claims`, plus the `v_portal_*` read surface
and `v_payment_claims_detail` / `v_parent_cards_detail` for staff. Read that
migration's header before touching any of it. Five things there break this
project's usual rules, deliberately:

- **A portal guardian is NOT a `pta.profiles` row.** `profiles.auth_user_id`
  has a real FK to `auth.users`, and a portal session is a custom HS256 JWT with
  no `auth.users` row behind it. So `current_profile_id()`, `current_school_ids()`
  and `has_school_role()` all return null/empty/false for a parent — the staff
  surface is worth nothing to a portal token, and it fails closed on the helpers
  rather than on a policy. Identity comes from `pta.current_guardian_id()`.
- **The `v_portal_*` views are `security_invoker = OFF`.** Every other view here
  is invoker so RLS decides. That cannot work for a parent: the base tables'
  policies are written against `current_school_ids()`, which is empty for them.
  The guardian filter is compiled INTO each view instead, and **if you add a view
  to that file the `where ... = pta.current_guardian_id()` is not optional.**
  Note also that a definer view reading an *invoker* view does not lend it the
  owner's rights — that is why `portal_balance_rows()`, `portal_attendance_rows()`
  and `portal_pledge_rows()` exist as definer functions around
  `v_student_charge_balances`, `v_attendance_local` and `v_donation_pledge_status`.
  Do not re-derive a balance or a Manila day boundary in a portal view; that
  duplication is exactly what D11 and D15 forbid.
- **`pta.portal_accounts` has NO POLICY AT ALL**, not even a read, and no
  `service_role` grant. RLS is row-level: a policy letting a cashier see their
  school's rows would let them see `card_number` and `pin_hash` inside those
  rows — and a cashier reads card numbers off the POS scanner all day. Staff go
  through `v_parent_cards_detail` (masked, definer); the POS goes through
  `pta.lookup_parent_card()`, which returns children and never the credential.
- **The PIN is OPTIONAL, per school** (`0017_portal_optional_pin.sql`), via the
  `school_settings` key `portal_require_pin`, **defaulting to off**. With it off
  the barcode is a single-factor bearer credential: worn on a lanyard, readable
  from a photograph, and scanned by cashiers at the POS all day — so whoever
  holds the number sees a child's gate movements and can submit claims in that
  family's name. Revocation becomes the primary control and the per-IP throttle
  in `portal_login()` becomes the only brake, since there is no longer a secret
  to get wrong. Nothing is deleted when it is off: `pin_hash`, `must_change_pin`,
  `portal_change_pin()` and `reset_parent_pin()` all remain and issuance still
  mints a PIN, so turning it back on is one checkbox and no reissued cards.
  The login form sends the card alone; `portal_login()` answers `pin_required`
  — for a **real** card only, so it is not an oracle — and the form then reveals
  the PIN field.
- **The PIN is hashed in SQL, not TypeScript.** `pgcrypto` is not enabled and
  this migration does not add an extension to a shared database, so the KDF is
  25,000 rounds of the core `sha256()` built-in over a per-account salt.
  Verification happens inside `pta.portal_login()` because the only key in this
  request path is the *public* anon key — any RPC returning a hash for
  TypeScript to check would let anyone harvest every hash in the school.
- **`anon` gains a second EXECUTE grant, `pta.portal_login()`.** 0013 said anon
  holds exactly one verb; logging in cannot require already being logged in.
  It is rate-limited per account AND per IP, returns no hash, and anon still
  holds no table privilege anywhere in `pta`.

`0016` also **closes a hole 0013 left**: `issue_enroll_token()` was granted to
`authenticated` with no authorization check, which was harmless until a parent
held such a token. It now takes a `guardian_id` and checks the caller.

### A payment claim is NOT a payment
`payment_claims` is money a parent *says* they sent. Submitting one creates no
`pta.payments` row, consumes no receipt number, and moves nothing in
`v_student_charge_balances`. Approval calls the **existing** `create_payment()`
or `record_donation()`, so a portal payment is indistinguishable downstream from
one taken at the counter — same receipt series, same daily report.

- **`collected_by` / `received_by` is the REVIEWER.** They are the person who
  checked the GCash app. There is no system profile; anything that invents one
  is wrong.
- A claim for a student with **no active enrollment** is refused at *submission*,
  because `pta.payments` has an FK to `student_enrollments` and approval would
  otherwise fail after the parent had already sent money.
- **Pledges bypass the queue entirely** — no money moves, so `portal_create_pledge()`
  writes directly. It inserts the donor row itself rather than calling
  `upsert_donor()`, which is staff-gated.
- Proof screenshots live in the private bucket **`pta-payment-proofs`**, path
  `{school_id}/{guardian_id}/…`. The parent holds an insert policy and **no read
  policy**: they upload, they do not browse.

### Manual steps for the portal
- `SUPABASE_JWT_SECRET` must be set (Supabase → Settings → API → JWT Keys).
  It signs for **every** role including `service_role`, across all three apps on
  this project — `lib/portal/jwt.ts` is the only file allowed to touch it, and
  the role there is a hardcoded constant.
- The GCash number, the Telegram bot username and the **Require a PIN** switch
  are set in the app, at **Administration → Settings → Parent Portal**
  (admin only). They are stored as
  `school_settings` rows keyed `gcash_number`, `telegram_bot` and
  `portal_require_pin`. `0018` re-asserts the two Telegram readers after `0016`
  was wrongly corrected in place: an applied migration is history, and a fix to
  one belongs in a new file. Both readers
  accept either a bare JSON string or `{"number": ...}` / `{"username": ...}`,
  because that table gets hand-edited in the SQL editor. Leave either blank and
  the portal omits that step rather than showing a half-configured screen.

### Setting up a NEW school
Most of it fails quietly, which is why `/super/schools/[id]` carries a setup
checklist that computes each item from the database. The three that fail
silently, and look identical to a broken deployment:

- **`pta.gate_notify_config`** — no row means gate notifications are OFF.
  `claim_notifications()` returns on `not found` without writing a
  `gate_notifications` row, so the gate records every tap and sends nothing.
  Nothing auto-creates it; the checkbox in Settings → Parent Portal does.
- **An active `school_year`** — without it `gate_roster` is empty, the portal
  shows no children, and no payment can be recorded (`pta.payments` has an FK
  to `student_enrollments`).
- **`school_settings.telegram_bot` / `gcash_number`** — the portal omits the
  step rather than announcing the gap.

Per school, hardware included: a `gate_devices` row mapping a device id to the
school (the tenancy key — `record_attendance()` refuses an unregistered device),
and an ESP32 flashed with that `DEVICE_ID`.

One-time and never repeated: the migrations, `esp32/sql/webhook.sql` (the
trigger is on the `pta.attendance` TABLE, so it covers every school), both Edge
Functions, Telegram's `setWebhook`, and `SUPABASE_JWT_SECRET`.

**There is one `TELEGRAM_BOT_TOKEN` for the whole deployment.** The per-school
`telegram_bot` setting only builds the deep link; sending uses that single
token, so every school shares one bot until `notify-guardian` learns to look a
token up per school.

### Architecture invariants
- Reads go through the RLS-bound user client. Money/identity writes go through
  `SECURITY DEFINER` RPCs in `pta`. Never write `payments` or `donations` from
  TypeScript.
- Balances come from `pta.v_student_charge_balances`. There is no stored
  paid/partial/unpaid column.
- Day boundaries are computed in SQL in `Asia/Manila`, never in the browser.
  `v_donations_local` does for donations what `v_payments_local` does for fees.
- No credit balances, no line-level voids, no PDF library, no `xlsx`, no `use cache`.
- `SUPABASE_SERVICE_ROLE_KEY` appears in no request path.

## Commands
```
npm run dev          # localhost:3000
npm run build
npm run lint
npm run typecheck
npm run test         # vitest, pure logic
./supabase/tests/test.sh   # SQL suite: RLS isolation, money, donations, the gate, the portal
```

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
