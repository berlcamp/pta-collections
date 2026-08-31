import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  PORTAL_SESSION_SECONDS,
  readPortalToken,
  type PortalClaims,
} from "./jwt";

/**
 * The portal session cookie.
 *
 * Namespaced away from `pta-auth` on purpose: a parent and a staff member may
 * share a phone, and a school computer certainly has both. Two cookies means
 * signing out of one is not signing out of the other, and a stray staff session
 * can never be mistaken for a portal one.
 */
export const PORTAL_COOKIE = "pta-portal" as const;

export async function setPortalSession(token: string): Promise<void> {
  const store = await cookies();
  store.set(PORTAL_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PORTAL_SESSION_SECONDS,
  });
}

export async function clearPortalSession(): Promise<void> {
  const store = await cookies();
  store.delete(PORTAL_COOKIE);
}

/** The current portal session, or null. Never throws. */
export async function getPortalSession(): Promise<PortalClaims | null> {
  const store = await cookies();
  return readPortalToken(store.get(PORTAL_COOKIE)?.value);
}

/**
 * For pages that require a parent.
 *
 * Note what this does NOT do: it does not decide what the parent may see. The
 * token says who they claim to be; `pta.current_guardian_id()` re-derives that
 * from `portal_accounts` on every single query and returns null for a revoked
 * card. A valid cookie for a revoked card therefore reaches a page that renders
 * nothing, which is the correct outcome and not one this file has to enforce.
 */
export async function requirePortalSession(): Promise<PortalClaims> {
  const session = await getPortalSession();
  if (!session) redirect("/portal/login");
  return session;
}
