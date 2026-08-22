# Local development

Runs the whole stack on your machine: Postgres, PostgREST, GoTrue (auth),
Storage and Studio, with all 11 migrations and demo data applied. **Nothing
here touches the shared cloud project.**

---

## 1. One-time setup

### Docker

Local Supabase needs a Docker daemon. You use colima:

```bash
colima start --cpu 4 --memory 8 --disk 40
```

Check it: `docker info` should print a version.

### Ports

You run several local Supabase stacks side by side, so PTA has its own block:

| Repo | Block | |
|---|---|---|
| bayugan-tracks (and others) | `543xx` | the CLI default |
| hris | `544xx` | |
| travelers-inn | `546xx` | |
| **pta-collections** | **`547xx`** | ← this repo |
| point-of-sale | `555xx` | |

So PTA is: API `54721`, DB `54722`, Studio `54723`, Mailpit `54724`.
Nothing collides; you can leave the others running.

---

## 2. Start it

```bash
npm install
npm run db:start     # first run pulls images — a few minutes
npm run dev
```

`db:start` applies `supabase/migrations/0001`–`0011` in order and then
`supabase/seed.sql`, which creates a demo school with 10 students, 22 charges,
7 payments (one deliberately voided) and a partial waiver — so every dashboard
and report has data immediately.

`.env.local` already points at `http://127.0.0.1:54721` with the standard local
demo keys. Those keys are identical on every machine and grant nothing beyond
localhost.

Open <http://localhost:3000>.

Useful:

```bash
npm run db:studio   # table browser at :54723
npm run db:reset    # wipe local DB, re-apply migrations + seed
npm run db:stop     # free the containers
npm run db:status   # ports and keys
```

---

## 3. Signing in

### Option A — email + password (no setup, ~10 seconds)

The login page shows a **Local development** panel, pre-filled with the
bootstrap super admin. Create the auth user once:

```bash
curl -s -X POST http://127.0.0.1:54721/auth/v1/admin/users \
  -H "apikey: $(npx supabase status -o json | python3 -c 'import sys,json;print(json.load(sys.stdin)["SERVICE_ROLE_KEY"])')" \
  -H "Authorization: Bearer $(npx supabase status -o json | python3 -c 'import sys,json;print(json.load(sys.stdin)["SERVICE_ROLE_KEY"])')" \
  -H "Content-Type: application/json" \
  -d '{"email":"berlcamp@gmail.com","password":"localdev12345","email_confirm":true,"user_metadata":{"full_name":"Berl Campomanes"}}'
```

Then click **Sign in locally**. `claim_invite()` binds you to the super-admin
row seeded by migration 0011.

This panel is gated on `NEXT_PUBLIC_ENABLE_DEV_LOGIN=true` **and** the Supabase
URL being localhost, so it cannot appear against the cloud project. Production
has no passwords at all.

### Option B — real Google OAuth

Use this to exercise the actual sign-in path.

**Step 1 — add a redirect URI to your Google OAuth client.**

You already have an OAuth client for the cloud Supabase project. Reuse it —
Google allows many redirect URIs per client.

1. <https://console.cloud.google.com/apis/credentials>
2. Open the OAuth 2.0 Client ID the cloud project uses
3. Under **Authorized redirect URIs**, *add* (do not replace):

   ```
   http://127.0.0.1:54721/auth/v1/callback
   ```

   That is the **local Supabase auth server**, not the Next.js app. Getting
   this wrong is the single most common failure — Google will show
   `redirect_uri_mismatch`.

4. Under **Authorized JavaScript origins**, add `http://localhost:3000`
5. Save. Google can take a few minutes to propagate.

**Step 2 — give the local stack the credentials.**

```bash
cp supabase/.env.example supabase/.env
```

Fill in:

```bash
SUPABASE_AUTH_GOOGLE_CLIENT_ID=<client id>.apps.googleusercontent.com
SUPABASE_AUTH_GOOGLE_SECRET=<client secret>
```

`supabase/.env` is gitignored.

**Step 3 — restart so the config is picked up.**

```bash
npm run db:stop && npm run db:start
```

**Step 4 — click *Continue with Google*.**

Sign in as `berlcamp@gmail.com` and you land on the Super Admin dashboard.
Any other Google account gets `/no-access` with zero data — which is the
system working, not a bug.

To test the invited-user path: sign in as super admin, create a school,
invite a second Google address you control, then sign in with it.

#### If Google sign-in fails

| Symptom | Cause |
|---|---|
| `redirect_uri_mismatch` | The URI must be exactly `http://127.0.0.1:54721/auth/v1/callback` — `127.0.0.1`, not `localhost`, and port `54721`, not `3000` |
| Redirected straight to `/no-access` | Auth worked; that email has no invite. Expected for any account other than `berlcamp@gmail.com` |
| `Unsupported provider` | `supabase/.env` is missing or empty — the stack needs a restart after filling it |
| Nothing happens | Check `NEXT_PUBLIC_SUPABASE_URL` is the local `54721`, not the cloud URL |

---

## 4. Tests

```bash
npm test        # 51 unit tests — money, allocation, CSV, timezone
npm run test:db # 58 SQL tests — tenant isolation and every money rule
```

`test:db` uses your local Postgres.app on a throwaway `pta_test` database and
stubs Supabase's `auth`/`storage` schemas. It is independent of the Docker
stack, so it runs whether or not `db:start` is up.

---

## 5. Switching to the cloud project

Comment the local block in `.env.local` and uncomment the cloud one, then add
the anon key from Supabase → Settings → API.

Before it will work, `pta` must be listed in **Settings → API → Exposed
schemas** — otherwise PostgREST returns 404 for every table.

Migrations are applied **by hand through the SQL Editor**, in order. Never
`supabase db push` — the project is shared with construction-saas and sms-demo,
and push operates on the whole database. See `CLAUDE.md`.
