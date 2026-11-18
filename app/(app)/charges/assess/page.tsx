import { ListChecks } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getFeeTypes, getSchoolYears, resolveSchoolYear } from "@/lib/data/school";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import {
  AssessFeesForm,
  type ScopeGrade,
} from "@/components/charges/assess-fees-form";

export const dynamic = "force-dynamic";

export default async function AssessPage({
  searchParams,
}: {
  searchParams: Promise<{ sy?: string }>;
}) {
  const ctx = await requireRole(["admin"]);
  const { sy } = await searchParams;

  const [schoolYear, schoolYears, feeTypes] = await Promise.all([
    resolveSchoolYear(ctx.activeSchool.id, sy),
    getSchoolYears(ctx.activeSchool.id),
    getFeeTypes(ctx.activeSchool.id),
  ]);

  if (!schoolYear) {
    return (
      <>
        <PageHeader title="Assess fees" />
        <EmptyState icon={ListChecks} title="No school year yet" />
      </>
    );
  }

  const grades = await getScope(ctx.activeSchool.id, schoolYear.id);
  const enrolledCount = grades.reduce((s, g) => s + g.count, 0);

  const assessable = feeTypes.filter(
    (f) =>
      f.category === "annual" || f.category === "special" || f.category === "homeroom",
  );

  return (
    <>
      <PageHeader
        title="Assess fees"
        description={`Charge enrolled students in ${schoolYear.name} — the whole school, some grades, or some sections.`}
      />
      <AssessFeesForm
        // A new year has different sections; never carry a picked one across.
        key={schoolYear.id}
        schoolYears={schoolYears}
        currentYearId={schoolYear.id}
        feeTypes={assessable}
        enrolledCount={enrolledCount}
        grades={grades}
      />
    </>
  );
}

/**
 * Enrolled students per grade and per section, for the scope picker and its
 * running count. Counted by PostgREST (head requests and an embedded count),
 * never by fetching the roll — a large school is several thousand rows and
 * PostgREST caps a response at a thousand.
 */
async function getScope(schoolId: string, schoolYearId: string): Promise<ScopeGrade[]> {
  const supabase = await createClient();

  const [{ data: levels }, { data: sections }] = await Promise.all([
    supabase.from("grade_levels").select("code,label,sort_order").order("sort_order"),
    supabase
      .from("sections")
      .select("id,name,grade_level,student_enrollments(count)")
      .eq("school_id", schoolId)
      .eq("school_year_id", schoolYearId)
      .eq("student_enrollments.status", "enrolled")
      .order("name"),
  ]);

  const counts = await Promise.all(
    (levels ?? []).map(async (l) => {
      const { count } = await supabase
        .from("student_enrollments")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId)
        .eq("school_year_id", schoolYearId)
        .eq("status", "enrolled")
        .eq("grade_level", l.code);
      return count ?? 0;
    }),
  );

  type SectionRow = {
    id: string;
    name: string;
    grade_level: string;
    student_enrollments: { count: number }[];
  };

  return (levels ?? [])
    .map((l, i) => ({
      code: l.code as string,
      label: l.label as string,
      count: counts[i] ?? 0,
      sections: ((sections ?? []) as SectionRow[])
        .filter((s) => s.grade_level === l.code)
        .map((s) => ({
          id: s.id,
          name: s.name,
          count: s.student_enrollments[0]?.count ?? 0,
        })),
    }))
    .filter((g) => g.count > 0 || g.sections.length > 0);
}
