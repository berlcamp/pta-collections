import { UserPlus } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  getGradeLevels,
  getSections,
  resolveSchoolYear,
} from "@/lib/data/school";
import { getGuardianSummary } from "@/lib/data/guardians";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { NewStudentForm } from "@/components/students/new-student-form";
import type { NewStudentInput } from "@/lib/validations/students";

export const dynamic = "force-dynamic";

export default async function NewStudentPage({
  searchParams,
}: {
  searchParams: Promise<{ sibling?: string }>;
}) {
  const ctx = await requireRole(["admin"]);
  const { sibling: siblingId } = await searchParams;
  const [schoolYear, gradeLevels, sibling] = await Promise.all([
    resolveSchoolYear(ctx.activeSchool.id),
    getGradeLevels(),
    siblingId ? getSibling(ctx.activeSchool.id, siblingId) : null,
  ]);

  if (!schoolYear) {
    return (
      <>
        <PageHeader title="Add student" />
        <EmptyState icon={UserPlus} title="Create a school year first" />
      </>
    );
  }

  const sections = await getSections(ctx.activeSchool.id, schoolYear.id);

  return (
    <>
      <PageHeader
        title={sibling ? "Add sibling" : "Add student"}
        description={`Enrolling into ${schoolYear.name}`}
      />
      <NewStudentForm
        schoolYearId={schoolYear.id}
        gradeLevels={gradeLevels}
        sections={sections}
        sibling={sibling}
      />
    </>
  );
}

/**
 * The student whose family a new one joins: their last name and their primary
 * guardian, pre-linked by id. Read through RLS and filtered to the active
 * school, so a sibling id from another school resolves to nothing and the form
 * opens blank rather than linking across tenants.
 */
async function getSibling(schoolId: string, studentId: string) {
  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("first_name, last_name, links:student_guardians(guardian_id, relationship, is_primary)")
    .eq("school_id", schoolId)
    .eq("id", studentId)
    .maybeSingle();
  if (!student) return null;

  const s = student as unknown as {
    first_name: string;
    last_name: string;
    links: { guardian_id: string; relationship: string; is_primary: boolean }[] | null;
  };
  const link = (s.links ?? []).find((l) => l.is_primary) ?? s.links?.[0];
  const guardian = link ? await getGuardianSummary(schoolId, link.guardian_id) : null;

  // Siblings share their parents, so the relationship carries over as-is —
  // Mother of one is Mother of the other, and an older brother acting as
  // guardian is "Sibling" to both. Still editable on the form.
  const relationship = (link?.relationship ??
    "Mother") as NewStudentInput["guardian"]["relationship"];

  return {
    name: `${s.first_name} ${s.last_name}`,
    lastName: s.last_name,
    guardian,
    relationship,
  };
}
