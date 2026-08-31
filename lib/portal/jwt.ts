import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Portal session tokens.
 *
 * A parent has no `auth.users` row — `pta.profiles.auth_user_id` carries a real
 * FK to it, which is precisely why a guardian cannot be a profile (0016). So the
 * portal mints its own HS256 token against the project's JWT secret, carrying a
 * `guardian_id` claim that `pta.current_guardian_id()` reads.
 *
 * THIS FILE IS THE ONLY PLACE THAT TOUCHES THE SIGNING SECRET, for two reasons.
 *
 * 1. That secret signs for EVERY role, `service_role` included. A token minted
 *    with `role: 'service_role'` would bypass RLS across `pta`, `public`,
 *    construction-saas and sms-demo. The role below is a hardcoded constant and
 *    is never taken from a caller. Nothing else in this app may sign anything.
 *
 * 2. Supabase is migrating projects to asymmetric signing keys, at which point
 *    the shared secret stops existing. When that happens, this module is the
 *    only file that changes.
 *
 * There is no refresh token. A parent logs in with a card and a PIN roughly
 * twice a month; a 12-hour session is plenty, and the absence of rotation
 * removes an entire class of bug. Revocation does not depend on the token at
 * all: `current_guardian_id()` re-checks `portal_accounts.status` on every call,
 * so revoking a lost card kills sessions that are already open.
 */

/** 12 hours. Long enough for a school day, short enough to be forgettable. */
export const PORTAL_SESSION_SECONDS = 12 * 60 * 60;

export type PortalClaims = {
  sub: string;
  guardian_id: string;
  school_id: string;
  school_name: string;
  locale: "en" | "tl";
};

type SignedClaims = PortalClaims & {
  role: "authenticated";
  aud: "authenticated";
  iat: number;
  exp: number;
};

function secret(): string {
  const value = process.env.SUPABASE_JWT_SECRET;
  if (!value) {
    throw new Error(
      "Missing SUPABASE_JWT_SECRET. The parent portal signs its own sessions; " +
        "copy the value from Supabase → Settings → API → JWT Keys.",
    );
  }
  return value;
}

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64url");

function sign(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

export function mintPortalToken(claims: PortalClaims): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SignedClaims = {
    ...claims,
    // Hardcoded. Never widen this, and never read it from an argument: the
    // secret below can mint service_role for three different products.
    role: "authenticated",
    aud: "authenticated",
    iat: now,
    exp: now + PORTAL_SESSION_SECONDS,
  };

  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  return `${header}.${body}.${sign(`${header}.${body}`)}`;
}

/**
 * Verify and decode. Returns null for anything that is not a valid, unexpired
 * token this app signed — a caller should treat null as "not logged in" and
 * never as "log an error".
 */
export function readPortalToken(token: string | undefined): PortalClaims | null {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;

  // Constant-time, and length-checked first because timingSafeEqual throws on
  // a length mismatch rather than returning false.
  const expected = Buffer.from(sign(`${header}.${body}`));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length) return null;
  if (!timingSafeEqual(expected, actual)) return null;

  try {
    const claims = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as SignedClaims;

    if (claims.role !== "authenticated") return null;
    if (typeof claims.exp !== "number") return null;
    if (claims.exp <= Math.floor(Date.now() / 1000)) return null;
    if (!claims.guardian_id || !claims.school_id) return null;

    return {
      sub: claims.sub,
      guardian_id: claims.guardian_id,
      school_id: claims.school_id,
      school_name: claims.school_name,
      locale: claims.locale === "tl" ? "tl" : "en",
    };
  } catch {
    return null;
  }
}
