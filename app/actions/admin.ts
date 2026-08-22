"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSchool, requireSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import {
  inviteSchema,
  membershipStatusSchema,
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

  const supabase = await createClient();
  const { error } = await supabase
    .from("schools")
    .update({
      ...parsed.data,
      receipt_prefix: parsed.data.receipt_prefix.toUpperCase(),
    })
    .eq("id", ctx.activeSchool.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/settings");
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
