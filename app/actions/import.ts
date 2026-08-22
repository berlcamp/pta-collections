"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSchool } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import type { ParsedRow } from "@/lib/import/parse";
import type { ActionResult } from "./types";

export interface StageResult {
  batchId: string;
  total: number;
  valid: number;
  matched: number;
  duplicates: number;
  errors: number;
  /** Sections referenced by the file that do not yet exist. */
  newSections: { grade_level: string; name: string }[];
}

/**
 * Stage a parsed CSV into pta.student_import_batches / _rows.
 *
 * Nothing here touches students, guardians or enrollments. Matching happens on
 * (school_id, lrn) then (school_id, student_number) — never on name (D16).
 */
export async function stageImport(input: {
  filename: string;
  schoolYearId: string;
  rows: ParsedRow[];
  inFileDuplicates: number[];
}): Promise<ActionResult<StageResult>> {
  const ctx = await requireSchool();
  if (!can(ctx.activeRole, "importStudents")) {
    return { ok: false, error: "Only an administrator can import students." };
  }
  if (input.rows.length === 0) {
    return { ok: false, error: "The file contains no data rows." };
  }
  if (input.rows.length > 5000) {
    return { ok: false, error: "Split files larger than 5,000 rows." };
  }

  const supabase = await createClient();

  const { data: batch, error: batchError } = await supabase
    .from("student_import_batches")
    .insert({
      school_id: ctx.activeSchool.id,
      school_year_id: input.schoolYearId,
      filename: input.filename,
      uploaded_by: ctx.profile.id,
      status: "uploaded",
      total_rows: input.rows.length,
    })
    .select("id")
    .single();

  if (batchError || !batch) {
    return { ok: false, error: batchError?.message ?? "Could not create the batch." };
  }

  // Match against existing students, by LRN first then student number.
  const lrns = input.rows.map((r) => r.normalized?.lrn).filter(Boolean) as string[];
  const numbers = input.rows
    .map((r) => r.normalized?.student_number)
    .filter(Boolean) as string[];

  const [byLrnRes, byNumberRes] = await Promise.all([
    lrns.length
      ? supabase
          .from("students")
          .select("id, lrn")
          .eq("school_id", ctx.activeSchool.id)
          .in("lrn", lrns)
      : Promise.resolve({ data: [] }),
    numbers.length
      ? supabase
          .from("student_enrollments")
          .select("student_id, student_number")
          .eq("school_id", ctx.activeSchool.id)
          .in("student_number", numbers)
      : Promise.resolve({ data: [] }),
  ]);

  const lrnMap = new Map(
    ((byLrnRes.data ?? []) as { id: string; lrn: string }[]).map((s) => [s.lrn, s.id]),
  );
  const numberMap = new Map(
    ((byNumberRes.data ?? []) as { student_id: string; student_number: string }[]).map(
      (s) => [s.student_number, s.student_id],
    ),
  );

  const dupSet = new Set(input.inFileDuplicates);

  const rowsToInsert = input.rows.map((r) => {
    let status: "valid" | "error" | "duplicate" | "matched" = "valid";
    let matchedStudentId: string | null = null;

    if (r.errors.length > 0 || !r.normalized) {
      status = "error";
    } else if (dupSet.has(r.rowNumber)) {
      status = "duplicate";
    } else {
      matchedStudentId =
        (r.normalized.lrn ? lrnMap.get(r.normalized.lrn) : undefined) ??
        (r.normalized.student_number
          ? numberMap.get(r.normalized.student_number)
          : undefined) ??
        null;
      if (matchedStudentId) status = "matched";
    }

    return {
      batch_id: batch.id,
      school_id: ctx.activeSchool.id,
      row_number: r.rowNumber,
      raw: r.raw,
      normalized: r.normalized,
      status,
      errors: r.errors.length ? r.errors : null,
      matched_student_id: matchedStudentId,
    };
  });

  // Insert in chunks — a 5,000-row single insert can exceed the request limit.
  for (let i = 0; i < rowsToInsert.length; i += 500) {
    const { error } = await supabase
      .from("student_import_rows")
      .insert(rowsToInsert.slice(i, i + 500));
    if (error) {
      await supabase
        .from("student_import_batches")
        .update({ status: "failed", error_message: error.message })
        .eq("id", batch.id);
      return { ok: false, error: error.message };
    }
  }

  const counts = {
    valid: rowsToInsert.filter((r) => r.status === "valid").length,
    matched: rowsToInsert.filter((r) => r.status === "matched").length,
    duplicates: rowsToInsert.filter((r) => r.status === "duplicate").length,
    errors: rowsToInsert.filter((r) => r.status === "error").length,
  };

  await supabase
    .from("student_import_batches")
    .update({
      status: "validated",
      valid_rows: counts.valid,
      matched_rows: counts.matched,
      duplicate_rows: counts.duplicates,
      error_rows: counts.errors,
    })
    .eq("id", batch.id);

  // Which sections in the file don't exist yet? The user confirms these before
  // commit — the one prompt that stops 'Grade 7'/'G7'/'7' fragmenting (D21).
  const referenced = new Map<string, { grade_level: string; name: string }>();
  for (const r of input.rows) {
    if (!r.normalized?.section) continue;
    referenced.set(`${r.normalized.grade_level}||${r.normalized.section}`, {
      grade_level: r.normalized.grade_level,
      name: r.normalized.section,
    });
  }

  const { data: existing } = await supabase
    .from("sections")
    .select("grade_level, name")
    .eq("school_id", ctx.activeSchool.id)
    .eq("school_year_id", input.schoolYearId);

  const existingKeys = new Set(
    ((existing ?? []) as { grade_level: string; name: string }[]).map(
      (s) => `${s.grade_level}||${s.name}`,
    ),
  );

  const newSections = [...referenced.entries()]
    .filter(([k]) => !existingKeys.has(k))
    .map(([, v]) => v);

  return {
    ok: true,
    data: { batchId: batch.id, total: input.rows.length, ...counts, newSections },
  };
}

/** Commit a staged batch. All-or-nothing, inside pta.commit_import_batch. */
export async function commitImport(
  batchId: string,
  updateEnrollment: boolean,
): Promise<
  ActionResult<{
    created: number;
    matched: number;
    guardians: number;
    skipped: number;
  }>
> {
  const ctx = await requireSchool();
  if (!can(ctx.activeRole, "importStudents")) {
    return { ok: false, error: "Only an administrator can import students." };
  }

  const supabase = await createClient();

  await supabase
    .from("student_import_batches")
    .update({ update_enrollment: updateEnrollment })
    .eq("id", batchId)
    .eq("school_id", ctx.activeSchool.id);

  const { data, error } = await supabase.rpc("commit_import_batch", {
    p_batch_id: batchId,
  });

  if (error) {
    await supabase
      .from("student_import_batches")
      .update({ status: "failed", error_message: error.message })
      .eq("id", batchId);
    return { ok: false, error: error.message };
  }

  const row = Array.isArray(data) ? data[0] : data;

  revalidatePath("/students");
  revalidatePath("/dashboard");

  return {
    ok: true,
    data: {
      created: Number(row?.created_students ?? 0),
      matched: Number(row?.matched_students ?? 0),
      guardians: Number(row?.created_guardians ?? 0),
      skipped: Number(row?.skipped_rows ?? 0),
    },
  };
}

export async function cancelImport(batchId: string): Promise<ActionResult> {
  const ctx = await requireSchool();
  if (!can(ctx.activeRole, "importStudents")) {
    return { ok: false, error: "Not authorized." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("student_import_batches")
    .update({ status: "cancelled" })
    .eq("id", batchId)
    .eq("school_id", ctx.activeSchool.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}
