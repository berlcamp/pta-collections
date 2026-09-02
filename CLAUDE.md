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
- **`/super/parent-cards` is the third tab**, and the reason it sits under Gate
  attendance rather than Administration is that it is the parent-facing half of
  the same reader: the student card enrolled on the previous tab is what taps,
  and the parent card is what lets the family watch those taps. Its RPCs
  (`issue_parent_card`, `revoke_parent_card`, `reset_parent_pin`) are still
  gated admin-or-treasurer in SQL; a super admin passes `require_school_role()`
  for any active school, which is why the TypeScript guard in
  `app/actions/parent-cards.ts` accepts `isSuperAdmin` — on `/super` there is no
  `activeRole` to check.

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
  The one door back to a number is `pta.reveal_parent_card()` (`0020`),
  **super admin only** and audited by last4 — not admin, not treasurer, and
  never a view column. It exists so a slip lost between the office and the
  parent costs a reprint instead of a revoke-and-reissue. The PIN has no
  equivalent and cannot get one: it is only a hash.
- **Any view that reads `portal_accounts` must be `security_invoker = off`.**
  A table nobody may read cannot be consulted by an invoker view — the subquery
  silently finds nothing. `v_parent_cards_pending` was invoker until `0020` and
  so listed every guardian as "awaiting a card" forever, including ones holding
  one. Definer means RLS no longer scopes the view either, so
  `where ... school_id = any (pta.current_school_ids())` goes in by hand, the
  same way the `v_portal_*` views compile in their guardian filter.
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

### A parent card follows the child, and is not clicked
`0022_parent_cards_automatic.sql`. Linking a guardian to a student MINTS their
parent card in the same transaction. Read that migration's header before
touching any of it.

- **The trigger is on `student_guardians`, not `parents_guardians`.** A card
  shows a guardian their children; a guardian with no child would sign in to an
  empty portal. `donors` and `parents_guardians` overlap (0014), so a school has
  guardian rows that are donors and nothing else — PP17n has always said such a
  person is not "awaiting a card", and 0022 must not hand them a live bearer
  credential. Firing on the link covers the roster (the guardian row and the
  link are written in one transaction by `createStudent` and by
  `commit_student_import`) and correctly skips the donor.
- **`mint_parent_card()` is the issuance with NO authorization in it**, granted
  to nobody, called only by `issue_parent_card()` (which checks the role) and by
  the trigger (which has no role to check — the insert it hangs off was already
  authorized). A card minted automatically and a card minted by a click are the
  same object, down to the audit row.
- **The trigger swallows its own exception, on purpose.** A card is a
  consequence of enrolling a child, not a precondition: a raising trigger would
  roll back a student registration or take down a 4,000-row CSV import over a
  credential that can be re-minted in one click. It is not quiet where it
  matters — the guardian stays in `v_parent_cards_pending`, which the
  "Missed a card" tile counts, and Issue still works. **That view is now a
  REPAIR surface, not a work queue, and should read zero.**
- **Nobody reads the bootstrap PIN any more.** An automatic issuance has no
  person to show it to, so it is hashed and never seen. With
  `portal_require_pin` off (the default, 0017) that changes nothing; with it on,
  `reset_parent_pin()` at the counter is the answer — which is where a PIN
  should be handed over anyway. A PIN is still minted and hashed every time, so
  turning the setting on later still needs no reissue.
- **`parent_card_roster()` is a BULK reveal and carries 0020's price**: super
  admin only via `is_super_admin()`, an RPC and never a view column, active
  cards only, and one audit row per run recording the COUNT and never a number
  (PP14). It backs the one door to card numbers in bulk — the "Download list for
  the press" button on `/super/parent-cards`, which downloads a PDF and **renders
  nothing**: the numbers go from the action into the file and out through a blob
  URL revoked on the next line, never onto a screen or into the DOM.
- **The roster PDF drops the contact number and the child count** even though
  the RPC returns them. The file leaves the building — a press needs a name, a
  number and bars, and a family's details have no business travelling with them.
- **`lib/pdf/` is hand-written, and is not a reversal of D19.** "No PDF library"
  was about not carrying jsPDF and its font subsetting so a receipt could be a
  print stylesheet, and every other printed document here still is one. This is
  the one document nobody prints themselves: it is emailed to a press, so it has
  to be a FILE, and a print dialog cannot make one without a human picking "Save
  as PDF" and holding the scale at 100% — below that the bars narrow and
  scanners start refusing them. So it is the `lib/barcode.ts` trade again:
  base-14 fonts, WinAnsiEncoding, no compression, no images, ~250 pure lines
  covered by `npm run test`. **Do not install a PDF library on the strength of
  this file**, and do not grow it into one — a second such document is a reason
  to reopen the decision, not to extend the writer.

### Creating a school year enrolls NOBODY — promotion does
`0021_student_promotion.sql`. `saveSchoolYear` inserts a `school_years` row and
flips `is_active`; it touches no student. Enrollment is per
`(student, school_year)`, so a new year opens empty and, the moment it goes
active, the roll reads empty, the gate roster is empty, the portal shows
parents no children, and no payment can be recorded at all. That is the third
silent failure above, hitting an established school every June rather than a
new one once.

`/admin/school-years/promote` is the step that fills it. Two functions, split
on purpose and sharing one CTE shape so the preview cannot disagree with the
commit it previews:

- **`pta.promotion_plan()` is SECURITY INVOKER**, because a preview is a read
  and reads are RLS-bound here like every other one. **`promote_students()` is
  DEFINER** — the one place identity records do NOT follow `createStudent`'s
  "write it through the RLS client, a partial failure is recoverable by
  re-editing" rule. Four thousand students half-promoted is not recoverable by
  hand, so it is one transaction.
- **The progression rule is `grade_levels.sort_order`, one step.** Nothing else
  encodes it.
- **`default_exit_grade()` is deliberately blind to enrollment status.** It is
  the highest grade the year *taught*, not the highest still enrolled. Reading
  `status = 'enrolled'` looks more careful and walks a whole school out of the
  door one grade per click: promotion marks the exit cohort's enrollments
  `graduated`, so on a second run the grade below becomes the highest still
  enrolled and graduates too. `08_promotion.sql` PR23a exists because that bug
  was real.
- **Idempotent by construction** — `on conflict do nothing` on
  `unique (student_id, school_year_id)`. Re-running promotes only whoever was
  missed. Anything that counts "skipped" AFTER the insert counts the rows it
  just made; that one was real too (PR10).
- **It carries no section.** Sections are `unique (school_id, school_year_id,
  grade_level, name)`, so the target year's are different rows and a Grade 7
  "Rizal" implies no Grade 8 "Rizal". The office assigns them after.
- **It assesses no fees and touches no charge, payment or balance.** D25 holds:
  a graduate KEEPS their dues. `v_outstanding_dues` filters on neither status,
  it exposes `student_status` — so graduating a debtor moves their dues behind
  the "include inactive" toggle on `/charges/outstanding`, which already counts
  them. The preview says so before you click.
- The student number carries forward only when the target year has not already
  handed it to someone else, because `student_enrollments_number_idx` is not
  what the `on conflict` covers and a collision would take the whole run down.

### Architecture invariants
- Reads go through the RLS-bound user client. Money/identity writes go through
  `SECURITY DEFINER` RPCs in `pta`. Never write `payments` or `donations` from
  TypeScript.
- Balances come from `pta.v_student_charge_balances`. There is no stored
  paid/partial/unpaid column.
- Day boundaries are computed in SQL in `Asia/Manila`, never in the browser.
  `v_donations_local` does for donations what `v_payments_local` does for fees.
- No credit balances, no line-level voids, no `xlsx`, no `use cache`. No PDF
  library either — printed documents are print stylesheets; `lib/pdf/` is the
  single hand-written exception and says why in its header.
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
