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
./supabase/tests/test.sh   # SQL suite: RLS isolation, the money path, donations
```

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
