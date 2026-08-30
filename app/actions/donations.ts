"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSchool } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import {
  cancelPledgeSchema,
  donationSchema,
  donorSchema,
  pledgeSchema,
  programSchema,
  voidDonationSchema,
} from "@/lib/validations/donations";
import type { ActionResult } from "./types";

/**
 * Donation writes.
 *
 * Programs and donors are ordinary RLS-bound table writes (they are a
 * catalogue and a directory). Everything that touches money — donations and
 * pledges — goes through a SECURITY DEFINER RPC, for the same reason payments
 * do: the acknowledgement counter, the tenant checks and the audit row all have
 * to happen inside one transaction against locked rows.
 */

function revalidateDonationViews(programId?: string) {
  revalidatePath("/donations");
  revalidatePath("/donations/programs");
  revalidatePath("/donations/pledges");
  revalidatePath("/reports/donations");
  revalidatePath("/collections/today");
  revalidatePath("/dashboard");
  if (programId) revalidatePath(`/donations/programs/${programId}`);
}

export async function saveProgram(input: unknown): Promise<ActionResult> {
  const ctx = await requireSchool();
  if (!can(ctx.activeRole, "manageProgram")) {
    return { ok: false, error: "Only an administrator can manage programs." };
  }

  const parsed = programSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid program." };
  }
  const { id, schoolYearId, ...fields } = parsed.data;

  const supabase = await createClient();
  const { error } = id
    ? await supabase
        .from("donation_programs")
        .update(fields)
        .eq("id", id)
        .eq("school_id", ctx.activeSchool.id)
    : await supabase.from("donation_programs").insert({
        ...fields,
        school_id: ctx.activeSchool.id,
        school_year_id: schoolYearId,
      });

  if (error) {
    return {
      ok: false,
      error:
        error.code === "23505"
          ? "A program with that name already exists for this school year."
          : error.message,
    };
  }

  revalidateDonationViews(id);
  return { ok: true, data: undefined };
}

export async function recordDonation(
  input: unknown,
): Promise<ActionResult<{ id: string; acknowledgementNumber: string }>> {
  const ctx = await requireSchool();
  if (!can(ctx.activeRole, "recordDonation")) {
    return { ok: false, error: "You cannot record donations." };
  }

  const parsed = donationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid donation." };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_donation", {
    p_school_id: ctx.activeSchool.id,
    p_school_year_id: v.schoolYearId,
    p_program_id: v.programId,
    p_kind: v.kind,
    p_amount: v.amount,
    p_payment_method: v.kind === "cash" ? v.paymentMethod : null,
    p_item_description: v.kind === "in_kind" ? v.itemDescription : null,
    p_donor_id: v.isAnonymous ? null : v.donorId,
    p_donor: v.isAnonymous ? null : v.donor,
    p_is_anonymous: v.isAnonymous,
    p_pledge_id: v.pledgeId,
    p_reference_number: v.referenceNumber,
    p_remarks: v.remarks,
    p_idempotency_key: v.idempotencyKey,
  });

  if (error) return { ok: false, error: error.message };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.donation_id) {
    return { ok: false, error: "The donation was not recorded. Please try again." };
  }

  revalidateDonationViews(v.programId);

  return {
    ok: true,
    data: {
      id: row.donation_id as string,
      acknowledgementNumber: row.acknowledgement_number as string,
    },
  };
}

export async function voidDonation(input: unknown): Promise<ActionResult> {
  const ctx = await requireSchool();
  if (!can(ctx.activeRole, "voidDonation")) {
    return { ok: false, error: "Only an administrator or treasurer can void a donation." };
  }

  const parsed = voidDonationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_donation", {
    p_donation_id: parsed.data.donationId,
    p_reason: parsed.data.reason,
  });

  if (error) return { ok: false, error: error.message };

  revalidateDonationViews();
  revalidatePath(`/donations/${parsed.data.donationId}`);
  return { ok: true, data: undefined };
}

export async function createPledge(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireSchool();
  if (!can(ctx.activeRole, "recordPledge")) {
    return { ok: false, error: "You cannot record pledges." };
  }

  const parsed = pledgeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid pledge." };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_pledge", {
    p_school_id: ctx.activeSchool.id,
    p_school_year_id: v.schoolYearId,
    p_program_id: v.programId,
    p_amount: v.amount,
    p_donor_id: v.donorId,
    p_donor: v.donor,
    p_due_date: v.dueDate,
    p_notes: v.notes,
  });

  if (error) return { ok: false, error: error.message };

  revalidateDonationViews(v.programId);
  return { ok: true, data: { id: data as string } };
}

export async function cancelPledge(input: unknown): Promise<ActionResult> {
  const ctx = await requireSchool();
  if (!can(ctx.activeRole, "cancelPledge")) {
    return { ok: false, error: "Only an administrator or treasurer can cancel a pledge." };
  }

  const parsed = cancelPledgeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_pledge", {
    p_pledge_id: parsed.data.pledgeId,
    p_reason: parsed.data.reason,
  });

  if (error) return { ok: false, error: error.message };

  revalidateDonationViews();
  return { ok: true, data: undefined };
}

/** Corrects a donor's details. Never touches the donations already recorded. */
export async function saveDonor(input: unknown): Promise<ActionResult> {
  const ctx = await requireSchool();
  if (!can(ctx.activeRole, "manageDonors")) {
    return { ok: false, error: "You cannot edit the donor directory." };
  }

  const parsed = donorSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid donor." };
  }
  const { id, ...fields } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("donors")
    .update(fields)
    .eq("id", id)
    .eq("school_id", ctx.activeSchool.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/donations/donors");
  revalidateDonationViews();
  return { ok: true, data: undefined };
}
