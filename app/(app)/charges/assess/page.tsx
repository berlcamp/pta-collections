import { ListChecks } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getFeeTypes, getSchoolYears, resolveSchoolYear } from "@/lib/data/school";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { AssessFeesForm } from "@/components/charges/assess-fees-form";

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
        <PageHeader title="Assess annual fees" />
        <EmptyState icon={ListChecks} title="No school year yet" />
      </>
    );
  }

  const supabase = await createClient();
  const { count } = await supabase
    .from("student_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("school_id", ctx.activeSchool.id)
    .eq("school_year_id", schoolYear.id)
    .eq("status", "enrolled");

  const assessable = feeTypes.filter(
    (f) => f.category === "annual" || f.category === "special",
  );

  return (
    <>
      <PageHeader
        title="Assess annual fees"
        description={`Generate charges for enrolled students in ${schoolYear.name}.`}
      />
      <AssessFeesForm
        schoolYears={schoolYears}
        currentYearId={schoolYear.id}
        feeTypes={assessable}
        enrolledCount={count ?? 0}
      />
    </>
  );
}
