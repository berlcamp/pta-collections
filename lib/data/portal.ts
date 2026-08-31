import "server-only";

import { createPortalClient } from "@/lib/portal/supabase";
import type {
  PortalAccount,
  PortalBalance,
  PortalChild,
  PortalClaim,
  PortalPayment,
  PortalPledge,
  PortalProgram,
  PortalScan,
  PortalTelegramStatus,
} from "@/types/database.types";

/**
 * Portal reads.
 *
 * Every function here queries a `v_portal_*` view, and every one of those views
 * filters on `pta.current_guardian_id()` — read from the signed token, checked
 * against `portal_accounts.status` on each call. There is no `.eq('guardian_id',
 * ...)` anywhere below, and there must never be: the scoping is in the database,
 * where a forgotten filter is a failing test rather than a data leak.
 *
 * The one exception is `?student=` on the attendance page, which narrows what
 * the guardian may already see. Narrowing is safe; widening is not expressible.
 */

/**
 * The signed-in guardian's own account, or null.
 *
 * Null means "this session resolves to nobody" — a revoked card, or a deleted
 * guardian. It deliberately does NOT swallow a rejected token: if PostgREST
 * refuses the JWT outright, that is a misconfigured signing secret, and every
 * page in the portal would otherwise render as "logged out" while the cookie
 * says otherwise. Surfacing it names the actual problem instead.
 */
export async function getPortalAccount(): Promise<PortalAccount | null> {
  const supabase = await createPortalClient();
  const { data, error } = await supabase
    .from("v_portal_account")
    .select("*")
    .maybeSingle();

  if (error && isTokenRejected(error)) {
    throw new Error(
      "The portal session token was rejected by Supabase. SUPABASE_JWT_SECRET " +
        "does not match the project at NEXT_PUBLIC_SUPABASE_URL — check that " +
        "both point at the same project (the local stack's secret comes from " +
        `\`npx supabase status\`). Underlying error: ${error.message}`,
    );
  }

  return (data ?? null) as PortalAccount | null;
}

/** PostgREST answers a bad signature with a JWS error, not an empty result. */
function isTokenRejected(error: { message?: string; code?: string }): boolean {
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("jws") ||
    message.includes("jwt") ||
    message.includes("signature") ||
    error.code === "PGRST301"
  );
}

export async function getPortalChildren(): Promise<PortalChild[]> {
  const supabase = await createPortalClient();
  const { data } = await supabase
    .from("v_portal_children")
    .select("*")
    .order("full_name");
  return (data ?? []) as PortalChild[];
}

export async function getPortalScans(studentId?: string): Promise<PortalScan[]> {
  const supabase = await createPortalClient();
  let query = supabase
    .from("v_portal_attendance")
    .select("*")
    .order("scanned_at", { ascending: false })
    .limit(400);

  if (studentId) query = query.eq("student_id", studentId);

  const { data } = await query;
  return (data ?? []) as PortalScan[];
}

/** Unsettled charges only. A zero-balance line is noise on a payment form. */
export async function getPortalBalances(
  studentId?: string,
): Promise<PortalBalance[]> {
  const supabase = await createPortalClient();
  let query = supabase
    .from("v_portal_balances")
    .select("*")
    .gt("balance", 0)
    .order("due_date", { nullsFirst: false });

  if (studentId) query = query.eq("student_id", studentId);

  const { data } = await query;
  return (data ?? []) as PortalBalance[];
}

export async function getPortalPayments(): Promise<PortalPayment[]> {
  const supabase = await createPortalClient();
  const { data } = await supabase
    .from("v_portal_payments")
    .select("*")
    .order("payment_date", { ascending: false })
    .limit(100);
  return (data ?? []) as PortalPayment[];
}

export async function getPortalClaims(): Promise<PortalClaim[]> {
  const supabase = await createPortalClient();
  const { data } = await supabase
    .from("v_portal_claims")
    .select("*")
    .order("created_at", { ascending: false });
  return (data ?? []) as PortalClaim[];
}

export async function getPortalPrograms(): Promise<PortalProgram[]> {
  const supabase = await createPortalClient();
  const { data } = await supabase
    .from("v_portal_programs")
    .select("*")
    .order("name");
  return (data ?? []) as PortalProgram[];
}

export async function getPortalPledges(): Promise<PortalPledge[]> {
  const supabase = await createPortalClient();
  const { data } = await supabase
    .from("v_portal_pledges")
    .select("*")
    .order("created_at", { ascending: false });
  return (data ?? []) as PortalPledge[];
}

export async function getPortalTelegram(): Promise<PortalTelegramStatus | null> {
  const supabase = await createPortalClient();
  const { data } = await supabase
    .from("v_portal_telegram")
    .select("*")
    .maybeSingle();
  return (data ?? null) as PortalTelegramStatus | null;
}

/**
 * A short-lived URL for a gate capture.
 *
 * `gate-captures` was created by 0013 as private with no policies, read only by
 * the notifier's service key. 0016 adds exactly one policy to it, and that
 * policy asks `pta.may_view_capture()` — which walks
 * attendance → student_cards → student_guardians and answers only for a PRIMARY
 * guardian. So the check that matters happened in Postgres before this call
 * signed anything, and a non-primary guardian gets null here.
 *
 * Five minutes: long enough to render a page, short enough that a URL pasted
 * into a group chat is dead before it is read.
 */
export async function signCaptureUrl(path: string): Promise<string | null> {
  const supabase = await createPortalClient();
  const { data } = await supabase.storage
    .from("gate-captures")
    .createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}

/** Group scans by their SQL-computed local date. Never re-bucket in JS (D11). */
export function groupScansByDay(scans: PortalScan[]): [string, PortalScan[]][] {
  const days = new Map<string, PortalScan[]>();
  for (const scan of scans) {
    const bucket = days.get(scan.local_date);
    if (bucket) bucket.push(scan);
    else days.set(scan.local_date, [scan]);
  }
  return [...days.entries()];
}
