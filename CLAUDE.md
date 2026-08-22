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

### Manual dashboard step
`pta` must be listed in Settings → API → Exposed schemas, or PostgREST returns 404
for every table.

### Architecture invariants
- Reads go through the RLS-bound user client. Money/identity writes go through
  `SECURITY DEFINER` RPCs in `pta`. Never write `payments` from TypeScript.
- Balances come from `pta.v_student_charge_balances`. There is no stored
  paid/partial/unpaid column.
- Day boundaries are computed in SQL in `Asia/Manila`, never in the browser.
- No credit balances, no line-level voids, no PDF library, no `xlsx`, no `use cache`.
- `SUPABASE_SERVICE_ROLE_KEY` appears in no request path.

## Commands
```
npm run dev          # localhost:3000
npm run build
npm run lint
npm run typecheck
npm run test         # vitest, pure logic
```

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
