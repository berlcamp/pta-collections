"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";
import { PTA_COOKIE_PREFIX, PTA_SCHEMA, PTA_STORAGE_KEY } from "./config";

export function createClient() {
  return createBrowserClient<Database, typeof PTA_SCHEMA>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: PTA_SCHEMA },
      auth: { storageKey: PTA_STORAGE_KEY },
      cookieOptions: { name: PTA_COOKIE_PREFIX },
    },
  );
}
