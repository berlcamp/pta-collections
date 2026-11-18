"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSchool } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { dbId } from "@/lib/validations/id";
import type { ActionResult } from "./types";

const mergeSchema = z
  .object({ keepId: dbId(), mergeId: dbId() })
  .refine((v) => v.keepId !== v.mergeId, { message: "Choose two different parents." });

export interface MergeResult {
  children_moved: number;
  children_shared: number;
  card_revoked_last4: string | null;
  telegram_moved: boolean;
  card_minted: boolean;
}

/**
 * Merge a duplicate parent into the record being kept. All of it — children,
 * Telegram, donor history, the duplicate's card — happens in
 * pta.merge_guardians() as one transaction; see 0027 for the card rules.
 */
export async function mergeGuardians(input: unknown): Promise<ActionResult<MergeResult>> {
  const ctx = await requireSchool();
  if (!can(ctx.activeRole, "manageStudents")) {
    return { ok: false, error: "Only an administrator can merge parents." };
  }
  const parsed = mergeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("merge_guardians", {
    p_keep: parsed.data.keepId,
    p_merge: parsed.data.mergeId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/students/parents");
  revalidatePath("/students");
  revalidatePath("/super/parent-cards");
  return { ok: true, data: data as MergeResult };
}

const dismissSchema = z.object({ a: dbId(), b: dbId() });

/** "Not the same person" — spouses sharing a phone, two different Maria Santos. */
export async function dismissDuplicate(input: unknown): Promise<ActionResult> {
  const ctx = await requireSchool();
  if (!can(ctx.activeRole, "manageStudents")) {
    return { ok: false, error: "Only an administrator can do this." };
  }
  const parsed = dismissSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const [guardian_a, guardian_b] = [parsed.data.a, parsed.data.b].sort();
  const supabase = await createClient();
  const { error } = await supabase.from("guardian_duplicate_dismissals").insert({
    school_id: ctx.activeSchool.id,
    guardian_a,
    guardian_b,
  });
  if (error && error.code !== "23505") return { ok: false, error: error.message };

  revalidatePath("/students/parents");
  return { ok: true, data: undefined };
}
