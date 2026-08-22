import { UserPlus } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import {
  getGradeLevels,
  getSections,
  resolveSchoolYear,
} from "@/lib/data/school";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { NewStudentForm } from "@/components/students/new-student-form";

export const dynamic = "force-dynamic";

export default async function NewStudentPage() {
  const ctx = await requireRole(["admin"]);
  const [schoolYear, gradeLevels] = await Promise.all([
    resolveSchoolYear(ctx.activeSchool.id),
    getGradeLevels(),
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
        title="Add student"
        description={`Enrolling into ${schoolYear.name}`}
      />
      <NewStudentForm
        schoolYearId={schoolYear.id}
        gradeLevels={gradeLevels}
        sections={sections}
      />
    </>
  );
}
