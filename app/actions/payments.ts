"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSchool } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { createPaymentSchema, voidPaymentSchema } from "@/lib/validations/payment";
import type { ActionResult } from "./types";

/**
 * Record a payment.
 *
 * This action does NOT compute anything financial. It validates shape, then
 * hands everything to pta.create_payment, which re-checks authorization, locks
 * the charges, recomputes every balance, rejects overpayment, allocates the
 * receipt number and writes the audit row — all in one transaction.
 */
export async function createPayment(
  input: unknown,
): Promise<ActionResult<{ paymentId: string; receiptNumber: string; total: number }>> {
  const ctx = await requireSchool();

  if (!can(ctx.activeRole, "recordPayment")) {
    return { ok: false, error: "You do not have permission to record payments." };
  }

  const parsed = createPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid payment." };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_payment", {
    p_school_id: ctx.activeSchool.id,
    p_student_id: v.studentId,
    p_school_year_id: v.schoolYearId,
    p_payment_method: v.paymentMethod,
    p_items: v.items,
    p_reference_number: v.referenceNumber ?? null,
    p_remarks: v.remarks ?? null,
    p_amount_tendered: v.amountTendered ?? null,
    p_idempotency_key: v.idempotencyKey,
  });

  if (error) return { ok: false, error: error.message };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: false, error: "The payment did not return a receipt." };

  revalidatePath("/collections");
  revalidatePath("/collections/today");
  revalidatePath("/dashboard");
  revalidatePath(`/students/${v.studentId}`);

  return {
    ok: true,
    data: {
      paymentId: row.payment_id as string,
      receiptNumber: row.receipt_number as string,
      total: Number(row.total_amount),
    },
  };
}

/** Void a payment. Admin or treasurer only — enforced again inside the RPC. */
export async function voidPayment(input: unknown): Promise<ActionResult> {
  const ctx = await requireSchool();

  if (!can(ctx.activeRole, "voidPayment")) {
    return {
      ok: false,
      error: "Only an administrator or treasurer can void a payment.",
    };
  }

  const parsed = voidPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_payment", {
    p_payment_id: parsed.data.paymentId,
    p_reason: parsed.data.reason,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/collections");
  revalidatePath("/collections/today");
  revalidatePath("/dashboard");

  return { ok: true, data: undefined };
}
