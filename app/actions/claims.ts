"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./types";
import { dbId } from "@/lib/validations/id";

/**
 * The claims review queue.
 *
 * A claim is a parent's assertion that they sent money. Approving it is the
 * moment that money becomes real: `approve_payment_claim()` calls the EXISTING
 * `create_payment()` or `record_donation()`, so a portal payment is
 * indistinguishable downstream from one taken at the counter — same receipt
 * series, same balance view, same daily report.
 *
 * `collected_by` / `received_by` becomes the REVIEWER's profile, because they
 * are the person attesting that the transfer landed. There is no system
 * profile: somebody checked the GCash app, and the audit trail should name them.
 */

async function requireReviewer(): Promise<void> {
  const session = await getSessionContext();
  const role = session?.activeRole;
  if (!session || !role || !["admin", "cashier", "treasurer"].includes(role)) {
    throw new Error("Only a cashier, treasurer or administrator may review claims.");
  }
}

export async function approveClaim(
  claimId: unknown,
): Promise<ActionResult<{ receiptNumber?: string }>> {
  await requireReviewer();

  const parsed = dbId().safeParse(claimId);
  if (!parsed.success) return { ok: false, error: "Unknown claim." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approve_payment_claim", {
    p_claim_id: parsed.data,
  });

  if (error) return { ok: false, error: error.message };

  revalidateClaimViews();
  return {
    ok: true,
    data: { receiptNumber: (data as { receipt_number?: string })?.receipt_number },
  };
}

const rejectSchema = z.object({
  claimId: dbId(),
  reason: z
    .string()
    .trim()
    // The parent reads this. "Invalid" tells them nothing they can act on;
    // "the reference number does not match any GCash transfer we received"
    // tells them to check their receipt.
    .min(5, "Say what the parent should fix — they will read this."),
});

export async function rejectClaim(input: unknown): Promise<ActionResult> {
  await requireReviewer();

  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "A reason is required.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_payment_claim", {
    p_claim_id: parsed.data.claimId,
    p_reason: parsed.data.reason,
  });

  if (error) return { ok: false, error: error.message };

  revalidateClaimViews();
  return { ok: true, data: undefined };
}

function revalidateClaimViews(): void {
  revalidatePath("/collections/claims");
  revalidatePath("/collections");
  revalidatePath("/charges/outstanding");
}
