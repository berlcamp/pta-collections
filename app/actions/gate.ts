"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/auth/session";
import type { ActionResult } from "./types";
import { dbId } from "@/lib/validations/id";

/**
 * Gate card enrolment.
 *
 * Binding a card to a student decides whose attendance a tap becomes, so both
 * verbs go through the SECURITY DEFINER RPCs in 0015 rather than writing
 * pta.student_cards from here. That is what makes revoke-then-issue atomic and
 * what puts a row in the audit log; a TypeScript pair of statements would give
 * neither.
 *
 * Every route under /super is super-admin only (D2). The RPCs re-check with
 * pta.require_school_role() underneath, so this check is the outer door, not
 * the lock.
 */

const assignSchema = z.object({
  studentId: z.uuid("Pick a student from the roster."),
  // Normalised, not merely validated: the reader emits uppercase hex and
  // pta.student_cards has a CHECK that says so. A uid typed in lowercase from
  // the back of a card is the same card.
  cardUid: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine(
      (v) => /^[0-9A-F]{4,32}$/.test(v),
      "A card UID is 4–32 hexadecimal characters.",
    ),
});

export async function assignCard(input: unknown): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_student_card", {
    p_student_id: parsed.data.studentId,
    p_card_uid: parsed.data.cardUid,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/super/cards");
  revalidatePath("/super/attendance");
  return { ok: true, data: undefined };
}

/* ---------------------------------------------------------------------------
 * Clearing the enrolment queue (0023)
 *
 * Emptying a working list, and nothing else. It records no opinion about the
 * card and deletes no attendance: the uid returns to the queue the moment the
 * reader sees it again. See the header of 0023_gate_queue_clear.sql.
 * ------------------------------------------------------------------------- */

const clearSchema = z.object({
  schoolId: z.uuid("Pick a school."),
  /** Omitted means "the whole list". The set is then decided inside the RPC, in
   *  the same statement that writes it — a list computed in the browser would
   *  silently skip a card that tapped for the first time while the operator was
   *  reading the page. */
  cardUids: z
    .array(
      z
        .string()
        .trim()
        .transform((v) => v.toUpperCase())
        .refine(
          (v) => /^[0-9A-F]{4,32}$/.test(v),
          "A card UID is 4–32 hexadecimal characters.",
        ),
    )
    .min(1)
    .max(500)
    .optional(),
});

/** Returns how many uids actually left the list, which is not the same as how
 *  many were asked for: one a colleague cleared a second earlier counts zero. */
export async function clearUnassignedCards(
  input: unknown,
): Promise<ActionResult<number>> {
  await requireSuperAdmin();

  const parsed = clearSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("clear_unassigned_cards", {
    p_school_id: parsed.data.schoolId,
    p_card_uids: parsed.data.cardUids ?? null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/super/cards");
  return { ok: true, data: (data as number) ?? 0 };
}

export async function revokeCard(cardId: unknown): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = dbId().safeParse(cardId);
  if (!parsed.success) return { ok: false, error: "Unknown card." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_student_card", {
    p_card_id: parsed.data,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/super/cards");
  revalidatePath("/super/attendance");
  return { ok: true, data: undefined };
}
