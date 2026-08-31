import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";
import {
  PTA_SCHEMA,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
} from "@/lib/supabase/config";

/**
 * The portal's database client.
 *
 * Still the anon key — the portal introduces no new key and certainly not the
 * service key. The only difference from `lib/supabase/server.ts` is the
 * Authorization header: instead of a Supabase-issued session cookie it carries
 * the token minted in `lib/portal/jwt.ts`, whose `guardian_id` claim is what
 * `pta.current_guardian_id()` reads.
 *
 * `persistSession: false` matters. supabase-js would otherwise try to refresh a
 * token GoTrue never issued and cannot refresh, and would eventually clear the
 * header out from under us.
 */
export async function createPortalClient(token?: string) {
  const accessToken =
    token ?? (await getPortalSessionToken());

  return createSupabaseClient<Database, typeof PTA_SCHEMA>(
    SUPABASE_URL(),
    SUPABASE_ANON_KEY(),
    {
      db: { schema: PTA_SCHEMA },
      auth: { persistSession: false, autoRefreshToken: false },
      global: accessToken
        ? { headers: { Authorization: `Bearer ${accessToken}` } }
        : {},
    },
  );
}

/**
 * The un-authenticated client, for logging in.
 *
 * `pta.portal_login()` is one of the two functions in this schema that `anon`
 * may execute, for the unavoidable reason that logging in cannot require
 * already being logged in. It returns an identity and never a hash.
 */
export function createPortalAnonClient() {
  return createSupabaseClient<Database, typeof PTA_SCHEMA>(
    SUPABASE_URL(),
    SUPABASE_ANON_KEY(),
    {
      db: { schema: PTA_SCHEMA },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

async function getPortalSessionToken(): Promise<string | undefined> {
  const { cookies } = await import("next/headers");
  const { PORTAL_COOKIE } = await import("./session");
  const store = await cookies();
  return store.get(PORTAL_COOKIE)?.value;
}
