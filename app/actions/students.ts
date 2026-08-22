"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSchool } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { newStudentSchema } from "@/lib/validations/students";
import { normalizeContact } from "@/lib/utils/names";
import type { ActionResult } from "./types";

/**
 * Manual student registration.
 *
 * Written through the RLS-bound client rather than an RPC: these are identity
 * records, not money, and a partial failure here is recoverable by re-editing
 * rather than corrupting a ledger. Payments and charges are the ones that need
 * transactional RPCs.
 */
export async function createStudent(
  input: unknown,
): Promise<ActionResult<{ studentId: string }>> {
  const ctx = await requireSchool();
  if (!can(ctx.activeRole, "manageStudents")) {
    return { ok: false, error: "Only an administrator can add students." };
  }

  const parsed = newStudentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const v = parsed.data;

  const supabase = await createClient();

  const { data: student, error: studentError } = await supabase
    .from("students")
    .insert({
      school_id: ctx.activeSchool.id,
      lrn: v.lrn || null,
      first_name: v.first_name,
      middle_name: v.middle_name || null,
      last_name: v.last_name,
      suffix: v.suffix || null,
      birth_date: v.birth_date || null,
      sex: v.sex ?? null,
      status: "active",
      created_by: ctx.profile.id,
    })
    .select("id")
    .single();

  if (studentError || !student) {
    return {
      ok: false,
      error:
        studentError?.code === "23505"
          ? "A student with that LRN already exists in this school."
          : (studentError?.message ?? "Could not create the student."),
    };
  }

  const { error: enrollError } = await supabase.from("student_enrollments").insert({
    school_id: ctx.activeSchool.id,
    student_id: student.id,
    school_year_id: v.schoolYearId,
    section_id: v.section_id || null,
    grade_level: v.grade_level,
    student_number: v.student_number || null,
    status: "enrolled",
    created_by: ctx.profile.id,
  });

  if (enrollError) {
    // Roll back by hand: an unenrolled student cannot be charged (the composite
    // FK forbids it) and would otherwise be invisible and unusable.
    await supabase.from("students").delete().eq("id", student.id);
    return {
      ok: false,
      error:
        enrollError.code === "23505"
          ? "That student number is already used in this school year."
          : enrollError.message,
    };
  }

  for (const g of v.guardians) {
    const contact = normalizeContact(g.contact_number ?? null);

    // Reuse an existing guardian where one plainly matches — siblings share a
    // parent, and duplicating them fragments contact details.
    const { data: existing } = await supabase
      .from("parents_guardians")
      .select("id")
      .eq("school_id", ctx.activeSchool.id)
      .ilike("first_name", g.first_name)
      .ilike("last_name", g.last_name)
      .limit(1)
      .maybeSingle();

    let guardianId = (existing as { id: string } | null)?.id;

    if (!guardianId) {
      const { data: created } = await supabase
        .from("parents_guardians")
        .insert({
          school_id: ctx.activeSchool.id,
          first_name: g.first_name,
          last_name: g.last_name,
          contact_number: contact,
          email: g.email || null,
          created_by: ctx.profile.id,
        })
        .select("id")
        .single();
      guardianId = (created as { id: string } | null)?.id;
    }

    if (guardianId) {
      await supabase.from("student_guardians").insert({
        school_id: ctx.activeSchool.id,
        student_id: student.id,
        guardian_id: guardianId,
        relationship: g.relationship,
        is_primary: g.is_primary,
      });
    }
  }

  revalidatePath("/students");
  revalidatePath("/dashboard");

  return { ok: true, data: { studentId: student.id } };
}
