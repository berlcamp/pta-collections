import Link from "next/link";
import { Printer, ScrollText } from "lucide-react";
import { requireSchool } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getSchoolYears, resolveSchoolYear } from "@/lib/data/school";
import { getAnnualReport } from "@/lib/reports/queries";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { SchoolYearPicker } from "@/components/common/school-year-picker";
import { ExportButton } from "@/components/reports/export-button";
import { Button } from "@/components/ui/button";
import { AnnualReportBody } from "@/components/reports/annual-report-body";

export const dynamic = "force-dynamic";

export default async function AnnualReportPage({
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
        <PageHeader title="Annual PTA financial report" />
        <EmptyState icon={ScrollText} title="No school year yet" />
      </>
    );
  }

  const report = await getAnnualReport(ctx.activeSchool.id, schoolYear.id);

  return (
    <>
      <PageHeader
        title="Annual PTA financial report"
        description="Prepared for the PTA General Assembly."
        actions={
          <>
            <SchoolYearPicker years={schoolYears} current={schoolYear.id} />
            {can(ctx.activeRole, "exportReports") && <ExportButton report="annual" />}
            <Button size="sm" asChild>
              <Link href={`/print/report/annual?sy=${schoolYear.id}`} target="_blank">
                <Printer className="size-4" />
                Print
              </Link>
            </Button>
          </>
        }
      />
      <div className="rounded-lg border bg-card p-6">
        <AnnualReportBody
          report={report}
          schoolName={ctx.activeSchool.name}
          schoolYearName={schoolYear.name}
        />
      </div>
    </>
  );
}
