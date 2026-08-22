import { Upload } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getGradeLevels, resolveSchoolYear } from "@/lib/data/school";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { CsvImportWizard } from "@/components/students/csv-import-wizard";

export const dynamic = "force-dynamic";

export default async function ImportStudentsPage() {
  const ctx = await requireRole(["admin"]);
  const [schoolYear, gradeLevels] = await Promise.all([
    resolveSchoolYear(ctx.activeSchool.id),
    getGradeLevels(),
  ]);

  if (!schoolYear) {
    return (
      <>
        <PageHeader title="Import students" />
        <EmptyState
          icon={Upload}
          title="Create a school year first"
          description="An import is always scoped to one school year."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Import students"
        description={`Importing into ${ctx.activeSchool.name} · ${schoolYear.name}`}
      />
      <CsvImportWizard
        schoolYearId={schoolYear.id}
        schoolYearName={schoolYear.name}
        gradeCodes={gradeLevels.map((g) => g.code)}
      />
    </>
  );
}
