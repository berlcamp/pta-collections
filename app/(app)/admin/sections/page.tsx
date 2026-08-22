import { BookUser } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import {
  getGradeLevels,
  getSchoolYears,
  getSections,
  resolveSchoolYear,
} from "@/lib/data/school";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { SectionManager } from "@/components/admin/section-manager";

export const dynamic = "force-dynamic";

export default async function SectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ sy?: string }>;
}) {
  const ctx = await requireRole(["admin"]);
  const { sy } = await searchParams;

  const [schoolYear, schoolYears, gradeLevels] = await Promise.all([
    resolveSchoolYear(ctx.activeSchool.id, sy),
    getSchoolYears(ctx.activeSchool.id),
    getGradeLevels(),
  ]);

  if (!schoolYear) {
    return (
      <>
        <PageHeader title="Sections" />
        <EmptyState icon={BookUser} title="Create a school year first" />
      </>
    );
  }

  const sections = await getSections(ctx.activeSchool.id, schoolYear.id);

  return (
    <>
      <PageHeader
        title="Sections"
        description="Sections belong to a grade level within a school year. Defining them here is what stops the CSV importer creating 'Grade 7', 'GRADE 7' and 'G7' as three different sections."
      />
      <SectionManager
        sections={sections}
        gradeLevels={gradeLevels}
        schoolYears={schoolYears}
        currentYearId={schoolYear.id}
      />
    </>
  );
}
