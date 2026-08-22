import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database.types";
import {
  PTA_COOKIE_PREFIX,
  PTA_SCHEMA,
  PTA_STORAGE_KEY,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
} from "./config";

/**
 * The RLS-bound server client. Every read in the app goes through this, so
 * Postgres — not application code — decides what the user may see.
 *
 * There is deliberately no service-role client anywhere in the request path.
 * Money and identity writes go through SECURITY DEFINER RPCs instead.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database, typeof PTA_SCHEMA>(
    SUPABASE_URL(),
    SUPABASE_ANON_KEY(),
    {
      db: { schema: PTA_SCHEMA },
      auth: { storageKey: PTA_STORAGE_KEY },
      cookieOptions: { name: PTA_COOKIE_PREFIX },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Middleware refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  );
}
