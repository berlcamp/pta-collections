/**
 * Shared Supabase client configuration.
 *
 * `schema: 'pta'` — this project is shared with construction-saas and sms-demo.
 * Everything this app owns lives in the `pta` schema; nothing is in `public`.
 *
 * `storageKey: 'pta-auth'` — apps on this project may be served from the same
 * parent domain. Without a namespaced key, signing out of one app kills the
 * other's session.
 */
export const PTA_SCHEMA = "pta" as const;
export const PTA_STORAGE_KEY = "pta-auth" as const;
export const PTA_COOKIE_PREFIX = "pta-auth" as const;

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const SUPABASE_URL = () => requireEnv("NEXT_PUBLIC_SUPABASE_URL");
export const SUPABASE_ANON_KEY = () =>
  requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
