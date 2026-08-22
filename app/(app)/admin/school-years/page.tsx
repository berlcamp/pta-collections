import { requireRole } from "@/lib/auth/session";
import { getSchoolYears } from "@/lib/data/school";
import { PageHeader } from "@/components/common/page-header";
import { SchoolYearManager } from "@/components/admin/school-year-manager";

export const dynamic = "force-dynamic";

export default async function SchoolYearsPage() {
  const ctx = await requireRole(["admin"]);
  const years = await getSchoolYears(ctx.activeSchool.id);

  return (
    <>
      <PageHeader
        title="School years"
        description="School years are never deleted — financial history depends on them."
      />
      <SchoolYearManager years={years} />
    </>
  );
}
