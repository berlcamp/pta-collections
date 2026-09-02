# Smart Campus — by KeriTech

Gate attendance with Telegram alerts, a parent/guardian portal, and multi-tenant
PTA dues, penalties, collections, receipts and financial reporting for Philippine
schools. **A school is a tenant**; data is isolated at the database level by
PostgreSQL Row Level Security, not by application code.

Next.js 16 · React 19 · TypeScript (strict) · Supabase (schema `pta`) · Tailwind 4 · shadcn/ui

---

## ⚠️ Read before you touch the database

This app shares a Supabase project (`lvcbmopdstvupjpytjbb`) with
**construction-saas** and **sms-demo**. `auth.users`, `storage.objects` and the
`public` schema are shared infrastructure.

- **Never** run `supabase db push`, `db reset` or `db diff` against the remote —
  they operate on the whole database and will propose dropping the other apps'
  objects. Production migrations are applied by hand through the SQL Editor.
- **Never** add a trigger to `auth.users`. One that raises breaks signup for
  every app on the project.
- Everything this app owns lives in schema `pta`. Nothing goes in `public`.

Full rules: [`CLAUDE.md`](./CLAUDE.md).

## Setup

Local development runs the whole Supabase stack on your machine:

```bash
colima start          # Docker daemon
npm install
npm run db:start      # migrations + demo data, on port block 547xx
npm run dev
```

**[LOCAL_DEV.md](./LOCAL_DEV.md)** covers Google OAuth setup, the port-block
map for your other Supabase projects, and troubleshooting.

**Manual step the code cannot do for itself:** add `pta` to
*Supabase → Settings → API → Exposed schemas*, or PostgREST returns 404 for
every table.

**Set `NEXT_PUBLIC_SITE_URL` in production** (`.env` is gitignored, so it is not
in `.env.example` either). It backs `metadataBase`, `robots.txt` and the
sitemap, and it is what makes the Open Graph image URL absolute — a relative
`og:image` is dropped by Facebook, Messenger, Viber and Slack rather than
resolved against the page. On Vercel the project's production domain is used
when it is unset.

Apply `supabase/migrations/*.sql` in numeric order via the SQL Editor. The last
one seeds `berlcamp@gmail.com` as Super Admin; sign in with that Google account
to bind it.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest — pure business logic (51 tests) |
| `npm run test:db` | Rebuilds a local Postgres and runs the SQL suite (58 tests) |

`test:db` needs a local PostgreSQL (Postgres.app is detected automatically). It
stubs Supabase's `auth`/`storage` schemas so the migrations run against plain
Postgres, then asserts tenant isolation and every money rule.

## Architecture

**Reads** go through the RLS-bound Supabase client. **Money and identity writes**
go through `SECURITY DEFINER` functions in `pta`:

| Function | Guarantees |
|---|---|
| `create_payment` | Locks charges, recomputes balances, **rejects overpayment**, allocates the receipt number, writes the audit row — one transaction |
| `void_payment` | Whole payment only, admin/treasurer, mandatory reason, irreversible; receipt number never reissued |
| `assess_annual_fees` | Idempotent by unique index — re-running only catches students who were missed |
| `commit_import_batch` | Applies a staged CSV atomically, or applies nothing |
| `claim_invite` | Lazy provisioning after OAuth — replaces the `auth.users` trigger |
| `waive_charge` / `cancel_charge` | Reason mandatory; cannot waive past what is already paid |

There are deliberately **no insert/update policies** on `payments`,
`payment_items` or `student_charges`. If you want to write one, write an RPC.

### Invariants worth knowing

- **Balances are derived**, in `pta.v_student_charge_balances`. There is no
  stored paid/partial/unpaid column to drift.
- **Day boundaries are Asia/Manila, computed in SQL.** Postgres runs UTC; a
  07:30 Manila payment is "yesterday" in UTC, which would break every morning's
  cash reconciliation.
- **Receipt numbers are school-scoped** (`ONHS-2026-000001` and
  `TNHS-2026-000001` coexist) and **gaps are normal** — a number is consumed
  even if the transaction rolls back, and a voided number is never reissued.
- **Uniqueness on LRN and student number is per-school, never global** — a
  student legitimately transferring between two schools in this system needs
  the same LRN to exist twice.
- **Deactivation is instant.** `pta.current_school_ids()` is `STABLE`, not a JWT
  claim, so revoking access takes effect on the user's very next query.
- **`audit_logs` is append-only.** No UPDATE or DELETE policy exists, so those
  are denied to everyone including administrators.

### Deliberately not built

No credit balances or refunds · no line-level voids · no PDF library (browser
print) · no `xlsx` (CSV with a UTF-8 BOM) · no `use cache`/PPR/ISR on any
tenant-scoped route · no service-role key in any request path.

## Roles

| Role | Can |
|---|---|
| `admin` | Everything in the school, including voids and user management |
| `cashier` | Record payments, print receipts, read all payments in the school. **Cannot void** |
| `treasurer` | All reports and exports, **can void** |
| `viewer` | Read-only |
| Super Admin | Global: create/manage schools, switch into any school as an administrator |

The Super Admin school switcher is a **scoping filter, not a security boundary** —
a super admin may read every school by definition. Accountability comes from the
audit log, which stamps `acting_as_super_admin` plus the school on every action.

## Layout

```
app/(app)/      authenticated pages   app/(auth)/  login, no-access
app/print/      print surfaces        app/actions/ server actions
lib/supabase/   clients (schema 'pta', storageKey 'pta-auth')
lib/financial/  money.ts, allocation.ts     lib/import/  CSV parsing
lib/auth/       session + capabilities      lib/reports/ report queries
supabase/migrations/  0001–0011      supabase/tests/  SQL suite
```
