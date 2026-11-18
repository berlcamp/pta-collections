import { redirect } from "next/navigation";

import { getPortalAccount } from "@/lib/data/portal";
import { requirePortalSession } from "@/lib/portal/session";

export const dynamic = "force-dynamic";

/**
 * The signed-in portal shell.
 *
 * WHY THE `(session)` ROUTE GROUP EXISTS.
 * This layout redirects to /portal/login when there is no session. If it also
 * WRAPPED /portal/login — which it did while it sat at app/(portal)/portal/ —
 * then a visitor with no cookie hit the redirect, landed back on the same
 * layout, and the browser gave up with ERR_TOO_MANY_REDIRECTS. Same story for
 * /portal/set-pin, which this layout also redirects to.
 *
 * A route group adds no URL segment, so /portal, /portal/attendance and the
 * rest are unchanged — but login and set-pin now sit OUTSIDE this layout and
 * do their own gating. proxy.ts carries the same warning about /no-access for
 * exactly the same reason: a gate that redirects to a page it guards is a loop.
 *
 * Three gates, in order:
 *
 *  1. No valid session -> sign in. (requirePortalSession)
 *  2. A valid session whose account is REVOKED -> the account view returns no
 *     row, because every portal view filters on current_guardian_id() and that
 *     function re-checks portal_accounts.status on every call. A revoked card
 *     therefore lands back at sign-in even while its cookie is still valid,
 *     which is the whole point of not trusting the token.
 *  3. The bootstrap PIN is still in place -> replace it before anything else.
 *
 * getPortalAccount() is request-cached, so the page below reading it again for
 * the guardian's name costs nothing.
 */
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePortalSession();
  const account = await getPortalAccount();

  if (!account) redirect("/portal/login");
  // Both conditions. must_change_pin is still true on every card 0016 issued,
  // so a school running card-only would otherwise send every parent to replace
  // a secret nobody ever gave them -- and /portal/set-pin asks for the current
  // PIN, which they do not have. Turning the setting back on resumes the
  // prompt, because the column was never cleared.
  if (account.pin_required && account.must_change_pin) {
    redirect("/portal/set-pin");
  }

  // No chrome here: each screen draws its own hero and back arrow
  // (components/portal/screen.tsx). There is no tab bar by design.
  return children;
}
