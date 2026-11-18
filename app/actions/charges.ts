"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSchool } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import {
  assessSchema,
  cancelChargeSchema,
  feeTypeSchema,
  penaltySchema,
  waiveSchema,
} from "@/lib/validations/charges";
import { z } from "zod";
import { dbId } from "@/lib/validations/id";
import type { ActionResult } from "./types";

export async function saveFeeType(input: unknown): Promise<ActionResult> {
  const ctx = await requireSchool();
  if (!can(ctx.activeRole, "manageFeeTypes")) {
    return { ok: false, error: "Only an administrator can manage fee types." };
  }

  const parsed = feeTypeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid fee type." };
  }
  const { id, ...fields } = parsed.data;

  const supabase = await createClient();
  const { error } = id
    ? await supabase
        .from("fee_types")
        .update(fields)
        .eq("id", id)
        .eq("school_id", ctx.activeSchool.id)
    : await supabase
        .from("fee_types")
        .insert({ ...fields, school_id: ctx.activeSchool.id });

  if (error) {
    return {
      ok: false,
      error: error.code === "23505"
        ? "A fee type with that name already exists in this school."
        : error.message,
    };
  }

  revalidatePath("/charges/fees");
  return { ok: true, data: undefined };
}

export async function assessAnnualFees(
  input: unknown,
): Promise<ActionResult<{ created: number; skipped: number }>> {
  const ctx = await requireSchool();
  if (!can(ctx.activeRole, "assessFees")) {
    return { ok: false, error: "Only an administrator can assess fees." };
  }

  const parsed = assessSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("assess_fees", {
    p_school_id: ctx.activeSchool.id,
    p_school_year_id: v.schoolYearId,
    p_items: v.items.map((i) => ({ fee_type_id: i.feeTypeId, amount: i.amount })),
    p_grade_levels: v.gradeLevels?.length ? v.gradeLevels : null,
    p_section_ids: v.sectionIds?.length ? v.sectionIds : null,
    p_due_date: v.dueDate,
  });

  if (error) return { ok: false, error: error.message };

  const row = Array.isArray(data) ? data[0] : data;

  revalidatePath("/charges/assess");
  revalidatePath("/charges/outstanding");
  revalidatePath("/reports/sections");
  revalidatePath("/dashboard");

  return {
    ok: true,
    data: {
      created: Number(row?.created_count ?? 0),
      skipped: Number(row?.skipped_count ?? 0),
    },
  };
}

const previewSchema = z.object({
  schoolYearId: dbId(),
  gradeLevels: z.array(z.string().min(1)).nullable(),
  sectionIds: z.array(dbId()).nullable(),
});

/** Students and families in an assessment scope — the Assess screen's preview. */
export async function previewAssessScope(
  input: unknown,
): Promise<ActionResult<{ students: number; families: number }>> {
  const ctx = await requireSchool();
  if (!can(ctx.activeRole, "assessFees")) {
    return { ok: false, error: "Only an administrator can assess fees." };
  }
  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid scope." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("assessment_scope_count", {
    p_school_id: ctx.activeSchool.id,
    p_school_year_id: parsed.data.schoolYearId,
    p_grade_levels: parsed.data.gradeLevels,
    p_section_ids: parsed.data.sectionIds,
  });
  if (error) return { ok: false, error: error.message };
  const row = (Array.isArray(data) ? data[0] : data) as
    | { student_count: number; family_count: number }
    | undefined;
  return {
    ok: true,
    data: { students: Number(row?.student_count ?? 0), families: Number(row?.family_count ?? 0) },
  };
}

export async function createPenalty(input: unknown): Promise<ActionResult> {
  const ctx = await requireSchool();
  if (!can(ctx.activeRole, "createPenalty")) {
    return { ok: false, error: "You cannot create penalties." };
  }

  const parsed = penaltySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid penalty." };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_penalty", {
    p_school_id: ctx.activeSchool.id,
    p_student_id: v.studentId,
    p_school_year_id: v.schoolYearId,
    p_fee_type_id: v.feeTypeId,
    p_amount: v.amount,
    p_description: v.description,
    p_due_date: v.dueDate ?? null,
  });

  if (error) {
    return {
      ok: false,
      error: error.message.includes("student_charges_no_duplicate")
        ? "This student already has a live charge of that penalty type for this school year."
        : error.message,
    };
  }

  revalidatePath("/charges/penalties");
  revalidatePath(`/students/${v.studentId}`);
  return { ok: true, data: undefined };
}

export async function waiveCharge(input: unknown): Promise<ActionResult> {
  const ctx = await requireSchool();
  if (!can(ctx.activeRole, "waiveCharge")) {
    return { ok: false, error: "Only an administrator can waive a charge." };
  }

  const parsed = waiveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("waive_charge", {
    p_charge_id: parsed.data.chargeId,
    p_amount: parsed.data.amount,
    p_reason: parsed.data.reason,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/charges/outstanding");
  revalidatePath("/students", "layout");
  return { ok: true, data: undefined };
}

export async function cancelCharge(input: unknown): Promise<ActionResult> {
  const ctx = await requireSchool();
  if (!can(ctx.activeRole, "waiveCharge")) {
    return { ok: false, error: "Only an administrator can cancel a charge." };
  }

  const parsed = cancelChargeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_charge", {
    p_charge_id: parsed.data.chargeId,
    p_reason: parsed.data.reason,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/charges/outstanding");
  revalidatePath("/students", "layout");
  return { ok: true, data: undefined };
}
