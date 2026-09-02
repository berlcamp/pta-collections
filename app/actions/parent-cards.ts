"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./types";
import { dbId } from "@/lib/validations/id";

/**
 * Parent card issuance — the staff side of the portal.
 *
 * All three verbs are SECURITY DEFINER RPCs in 0016, gated on admin or
 * treasurer. Issuing a card is an IDENTITY decision, not a row insert: it
 * decides who can see a child's movements and act on a family's balances, so it
 * carries an audit row exactly as assign_student_card() does (D3).
 *
 * Cashiers are deliberately excluded. A cashier may take money all day; handing
 * out an identity is a different act, and the same cashier reads card numbers
 * off the POS scanner — see reset_parent_pin() in 0016 for why that matters.
 */

/**
 * Admin, treasurer — or a super admin, who reaches these verbs from
 * /super/parent-cards and so has no activeRole to check (D2: arriving at /super
 * means no active school). SQL takes the same view: require_school_role() in
 * 0016 passes a super admin for any active school, and the audit row records
 * who it actually was either way.
 */
async function requireCardIssuer(): Promise<void> {
  const session = await getSessionContext();
  if (!session) {
    throw new Error("Only an administrator or treasurer can issue parent cards.");
  }
  const role = session.activeRole;
  if (!session.isSuperAdmin && role !== "admin" && role !== "treasurer") {
    throw new Error("Only an administrator or treasurer can issue parent cards.");
  }
}

/**
 * Returns the card number and the bootstrap PIN EXACTLY ONCE.
 *
 * Neither is retrievable afterwards: `v_parent_cards_detail` masks the number
 * and the PIN exists only as a salted hash. That is the intended friction — a
 * credential nobody can look up again is a credential nobody can quietly copy
 * from a list screen.
 */
export async function issueParentCard(
  guardianId: unknown,
): Promise<ActionResult<{ cardNumber: string; pin: string; accountId: string }>> {
  await requireCardIssuer();

  const parsed = dbId().safeParse(guardianId);
  if (!parsed.success) return { ok: false, error: "Unknown guardian." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("issue_parent_card", {
    p_guardian_id: parsed.data,
  });

  if (error) {
    return {
      ok: false,
      error: error.message.includes("already holds")
        ? "This guardian already holds a parent card."
        : error.message,
    };
  }

  const result = data as { card_number: string; pin: string; account_id: string };

  revalidatePath("/super/parent-cards");
  return {
    ok: true,
    data: {
      cardNumber: result.card_number,
      pin: result.pin,
      accountId: result.account_id,
    },
  };
}

const revokeSchema = z.object({
  accountId: dbId(),
  reason: z.string().trim().min(3, "Say why — it goes in the audit log."),
});

export async function revokeParentCard(input: unknown): Promise<ActionResult> {
  await requireCardIssuer();

  const parsed = revokeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "A reason is required.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_parent_card", {
    p_account_id: parsed.data.accountId,
    p_reason: parsed.data.reason,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/super/parent-cards");
  return { ok: true, data: undefined };
}

/**
 * Reset a forgotten PIN.
 *
 * Staff-only ON PURPOSE, and this is the reason: the parent card's barcode is
 * scanned at the POS, so cashiers read card numbers in the course of normal
 * work. A self-service reset that needed only the card number would hand every
 * cashier a way into any parent's account, and into their children's gate
 * movements. Resetting requires standing in front of somebody.
 */
export async function resetParentPin(
  accountId: unknown,
): Promise<ActionResult<{ pin: string }>> {
  await requireCardIssuer();

  const parsed = dbId().safeParse(accountId);
  if (!parsed.success) return { ok: false, error: "Unknown card." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reset_parent_pin", {
    p_account_id: parsed.data,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/super/parent-cards");
  return { ok: true, data: { pin: (data as { pin: string }).pin } };
}

/**
 * Read a card number back. SUPER ADMIN ONLY.
 *
 * 0016 made the number unrecoverable on purpose, and that stands for everyone
 * else: an admin and a treasurer may ISSUE a card and still cannot read one
 * back, because issuing mints a fresh secret while revealing copies one already
 * in a parent's hands. What was missing was a reprint — a slip lost between the
 * office and the parent used to cost a revoke-and-reissue, locking the family
 * out of a card they were still holding.
 *
 * The authorization that counts is pta.is_super_admin() inside
 * reveal_parent_card() (0020), which also writes the audit row. The check here
 * only saves a round trip and gives a better message than a raised exception.
 */
export async function revealParentCard(
  accountId: unknown,
): Promise<ActionResult<{ cardNumber: string; guardianName: string }>> {
  const session = await getSessionContext();
  if (!session?.isSuperAdmin) {
    return { ok: false, error: "Only a super admin can read a card number back." };
  }

  const parsed = dbId().safeParse(accountId);
  if (!parsed.success) return { ok: false, error: "Unknown card." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reveal_parent_card", {
    p_account_id: parsed.data,
  });

  if (error) return { ok: false, error: error.message };

  const result = data as { card_number: string; guardian_name: string };
  return {
    ok: true,
    data: { cardNumber: result.card_number, guardianName: result.guardian_name },
  };
}
