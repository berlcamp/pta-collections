"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSchool, requireSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import {
  inviteSchema,
  membershipStatusSchema,
  promotionSchema,
  schoolSchema,
  schoolSettingsSchema,
  schoolYearSchema,
  sectionSchema,
} from "@/lib/validations/admin";
import type { ActionResult } from "./types";

export async function saveSchoolYear(input: unknown): Promise<ActionResult> {
  const ctx = await requireSchool();
  if (!can(ctx.activeRole, "manageSchoolYears")) {
    return { ok: false, error: "Only an administrator can manage school years." };
  }

  const parsed = schoolYearSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { id, ...fields } = parsed.data;

  if (fields.end_date <= fields.start_date) {
    return { ok: false, error: "The end date must be after the start date." };
  }

  const supabase = await createClient();

  // Only one active school year per school — enforced by a partial unique index,
  // so stand the others down first rather than colliding with it.
  if (fields.is_active) {
    await supabase
      .from("school_years")
      .update({ is_active: false })
      .eq("school_id", ctx.activeSchool.id)
      .neq("id", id ?? "00000000-0000-0000-0000-000000000000");
  }

  const { error } = id
    ? await supabase
        .from("school_years")
        .update(fields)
        .eq("id", id)
        .eq("school_id", ctx.activeSchool.id)
    : await supabase
        .from("school_years")
        .insert({ ...fields, school_id: ctx.activeSchool.id });

  if (error) {
    return {
      ok: false,
      error: error.code === "23505"
        ? "A school year with that name already exists."
        : error.message,
    };
  }

  revalidatePath("/admin/school-years");
  revalidatePath("/dashboard");
  return { ok: true, data: undefined };
}

export async function saveSection(input: unknown): Promise<ActionResult> {
  const ctx = await requireSchool();
  if (!can(ctx.activeRole, "manageSections")) {
    return { ok: false, error: "Only an administrator can manage sections." };
  }

  const parsed = sectionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { id, ...fields } = parsed.data;

  const supabase = await createClient();
  const { error } = id
    ? await supabase
        .from("sections")
        .update(fields)
        .eq("id", id)
        .eq("school_id", ctx.activeSchool.id)
    : await supabase
        .from("sections")
        .insert({ ...fields, school_id: ctx.activeSchool.id });

  if (error) {
    return {
      ok: false,
      error: error.code === "23505"
        ? "That section already exists for this grade level and school year."
        : error.message,
    };
  }

  revalidatePath("/admin/sections");
  return { ok: true, data: undefined };
}

export async function inviteUser(input: unknown): Promise<ActionResult> {
  const ctx = await requireSchool();
  if (!can(ctx.activeRole, "manageUsers")) {
    return { ok: false, error: "Only an administrator can invite users." };
  }

  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("invite_school_user", {
    p_school_id: ctx.activeSchool.id,
    p_email: parsed.data.email,
    p_full_name: parsed.data.full_name,
    p_role: parsed.data.role,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/users");
  return { ok: true, data: undefined };
}

export async function setMembershipStatus(input: unknown): Promise<ActionResult> {
  const ctx = await requireSchool();
  if (!can(ctx.activeRole, "manageUsers")) {
    return { ok: false, error: "Only an administrator can change access." };
  }

  const parsed = membershipStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_school_user_status", {
    p_school_user_id: parsed.data.schoolUserId,
    p_status: parsed.data.status,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/users");
  return { ok: true, data: undefined };
}

export async function saveSchoolSettings(input: unknown): Promise<ActionResult> {
  const ctx = await requireSchool();
  if (!can(ctx.activeRole, "manageSchoolSettings")) {
    return { ok: false, error: "Only an administrator can change school settings." };
  }

  const parsed = schoolSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  // The two portal keys live in pta.school_settings, not as columns on
  // pta.schools, so they are split out before the update rather than passed
  // through with the rest.
  const {
    gcash_number,
    telegram_bot_username,
    portal_require_pin,
    gate_notify_enabled,
    ...schoolColumns
  } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("schools")
    .update({
      ...schoolColumns,
      receipt_prefix: schoolColumns.receipt_prefix.toUpperCase(),
    })
    .eq("id", ctx.activeSchool.id);

  if (error) return { ok: false, error: error.message };

  // Ordinary RLS table writes: school_settings is configuration, gated on the
  // admin role by school_settings_admin_write (0006). No RPC — nothing here is
  // money or identity.
  //
  // Stored as bare JSON strings. pta.v_portal_account and v_portal_telegram
  // read them with coalesce(value ->> '<key>', value #>> '{}'), so a row
  // hand-written as an object in the SQL editor still resolves.
  const settings = [
    { key: "gcash_number", value: gcash_number },
    { key: "telegram_bot", value: telegram_bot_username },
    // Stored only when TRUE. pta.portal_pin_required() defaults to false, so an
    // absent row and a stored `false` mean the same thing — and one of them is
    // a row nobody has to reason about later.
    { key: "portal_require_pin", value: portal_require_pin ? true : "" },
  ];

  for (const { key, value } of settings) {
    const stored = typeof value === "boolean" ? value : (value ?? "").trim();

    if (stored === "") {
      // Cleared, not stored empty: an empty string would make the portal print
      // a blank GCash number rather than omit the step.
      const { error: delError } = await supabase
        .from("school_settings")
        .delete()
        .eq("school_id", ctx.activeSchool.id)
        .eq("key", key);
      if (delError) return { ok: false, error: delError.message };
      continue;
    }

    const { error: upError } = await supabase
      .from("school_settings")
      .upsert(
        { school_id: ctx.activeSchool.id, key, value: stored },
        { onConflict: "school_id,key" },
      );
    if (upError) return { ok: false, error: upError.message };
  }

  // Gate notifications: a different table, because it also carries the
  // staleness thresholds. Upserting only `enabled` leaves those alone on an
  // existing row and takes 0013's defaults on a new one.
  const { error: notifyError } = await supabase
    .from("gate_notify_config")
    .upsert(
      { school_id: ctx.activeSchool.id, enabled: gate_notify_enabled },
      { onConflict: "school_id" },
    );
  if (notifyError) return { ok: false, error: notifyError.message };

  revalidatePath("/admin/settings");
  revalidatePath("/portal", "layout");
  revalidatePath("/super/schools");
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

/** Super Admin only. */
export async function createSchool(
  input: unknown,
): Promise<ActionResult<{ schoolId: string }>> {
  const ctx = await requireSession();
  if (!ctx.isSuperAdmin) {
    return { ok: false, error: "Only a Super Admin can create schools." };
  }

  const parsed = schoolSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_school", {
    p_school_code: v.school_code,
    p_name: v.name,
    p_receipt_prefix: v.receipt_prefix,
    p_short_name: v.short_name ?? null,
    p_address: v.address ?? null,
    p_city: v.city ?? null,
    p_province: v.province ?? null,
    p_region: v.region ?? null,
    p_contact_number: v.contact_number ?? null,
    p_email: v.email ?? null,
  });

  if (error) {
    return {
      ok: false,
      error: error.code === "23505"
        ? "A school with that code already exists."
        : error.message,
    };
  }

  revalidatePath("/super/schools");
  return { ok: true, data: { schoolId: data as string } };
}

export async function setSchoolActive(
  schoolId: string,
  active: boolean,
): Promise<ActionResult> {
  const ctx = await requireSession();
  if (!ctx.isSuperAdmin) {
    return { ok: false, error: "Only a Super Admin can activate or deactivate a school." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("schools")
    .update({ active })
    .eq("id", schoolId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/super/schools");
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

/** Super Admin invites a school administrator. */
export async function inviteSchoolAdmin(
  schoolId: string,
  input: unknown,
): Promise<ActionResult> {
  const ctx = await requireSession();
  if (!ctx.isSuperAdmin) {
    return { ok: false, error: "Only a Super Admin can assign school administrators." };
  }

  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("invite_school_user", {
    p_school_id: schoolId,
    p_email: parsed.data.email,
    p_full_name: parsed.data.full_name,
    p_role: parsed.data.role,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/super/schools/${schoolId}`);
  return { ok: true, data: undefined };
}

/**
 * Roll the roll forward — every enrolled student up one grade into the next
 * school year, and the exit cohort out of the door.
 *
 * Unlike `createStudent`, which writes students through the RLS-bound client
 * because a partial failure there is recoverable by re-editing, this goes
 * through a SECURITY DEFINER RPC. Four thousand students half-promoted is not
 * recoverable by hand, so it has to be one transaction.
 *
 * The RPC is idempotent — `on conflict do nothing` on
 * `unique (student_id, school_year_id)` — so a double-submit promotes nobody
 * twice.
 */
export async function promoteStudents(
  input: unknown,
): Promise<ActionResult<{ promoted: number; graduated: number; skipped: number }>> {
  const ctx = await requireSchool();
  if (!can(ctx.activeRole, "manageSchoolYears")) {
    return { ok: false, error: "Only an administrator can promote students." };
  }

  const parsed = promotionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("promote_students", {
    p_school_id: ctx.activeSchool.id,
    p_from_year_id: v.fromYearId,
    p_to_year_id: v.toYearId,
    p_exit_grade: v.exitGrade,
  });

  if (error) return { ok: false, error: error.message };

  const row = Array.isArray(data) ? data[0] : data;

  // Everything downstream reads through the active school year, so the whole
  // school-scoped surface is stale after this.
  revalidatePath("/admin/school-years");
  revalidatePath("/students");
  revalidatePath("/charges/outstanding");
  revalidatePath("/dashboard");

  return {
    ok: true,
    data: {
      promoted: Number(row?.promoted_count ?? 0),
      graduated: Number(row?.graduated_count ?? 0),
      skipped: Number(row?.skipped_count ?? 0),
    },
  };
}
