import { Target } from "lucide-react";

import { requireSchool } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getSchoolYears, resolveSchoolYear } from "@/lib/data/school";
import { getProgramTotals, getPrograms } from "@/lib/data/donations";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { SchoolYearPicker } from "@/components/common/school-year-picker";
import { ProgramManager } from "@/components/donations/program-manager";

export const dynamic = "force-dynamic";

export default async function ProgramsPage({
  searchParams,
}: {
  searchParams: Promise<{ sy?: string }>;
}) {
  const ctx = await requireSchool();
  const { sy } = await searchParams;

  const [schoolYear, schoolYears] = await Promise.all([
    resolveSchoolYear(ctx.activeSchool.id, sy),
    getSchoolYears(ctx.activeSchool.id),
  ]);

  if (!schoolYear) {
    return (
      <>
        <PageHeader title="Programs" />
        <EmptyState icon={Target} title="No school year yet" />
      </>
    );
  }

  const [programs, totals] = await Promise.all([
    getPrograms(ctx.activeSchool.id, schoolYear.id),
    getProgramTotals(ctx.activeSchool.id, schoolYear.id),
  ]);

  return (
    <>
      <PageHeader
        title="Programs and activities"
        description="What the school is raising for. Every donation is recorded against one of these."
        actions={<SchoolYearPicker years={schoolYears} current={schoolYear.id} />}
      />
      <ProgramManager
        schoolYearId={schoolYear.id}
        programs={programs}
        totals={totals}
        canManage={can(ctx.activeRole, "manageProgram")}
      />
    </>
  );
}
