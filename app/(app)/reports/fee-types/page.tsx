import { FileBarChart } from "lucide-react";
import { requireSchool } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getSchoolYears, resolveSchoolYear } from "@/lib/data/school";
import { getFeeTypeReport } from "@/lib/reports/queries";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { FeeTypeReportTable } from "@/components/tables/report-tables";
import { ReportFilters } from "@/components/reports/report-filters";
import { ExportButton } from "@/components/reports/export-button";

export const dynamic = "force-dynamic";

export default async function FeeTypeReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireSchool();
  const sp = await searchParams;

  const [schoolYear, schoolYears] = await Promise.all([
    resolveSchoolYear(ctx.activeSchool.id, sp.sy),
    getSchoolYears(ctx.activeSchool.id),
  ]);

  if (!schoolYear) {
    return (
      <>
        <PageHeader title="Fee type report" />
        <EmptyState icon={FileBarChart} title="No school year yet" />
      </>
    );
  }

  const rows = await getFeeTypeReport({
    schoolId: ctx.activeSchool.id,
    schoolYearId: schoolYear.id,
    from: sp.from ?? null,
    to: sp.to ?? null,
  });

  const total = rows.reduce((s, r) => s + r.total, 0);

  return (
    <>
      <PageHeader
        title="Fee type report"
        description="Collections split by fee type, allocated at the line-item level."
        actions={
          can(ctx.activeRole, "exportReports") ? (
            <ExportButton report="fee-types" />
          ) : undefined
        }
      />

      <ReportFilters
        schoolYears={schoolYears}
        currentYearId={schoolYear.id}
        show={{ dateRange: true }}
      />

      {rows.length === 0 ? (
        <EmptyState icon={FileBarChart} title="No collections in this period" />
      ) : (
        <FeeTypeReportTable
          total={total}
          rows={rows.map((r) => ({
            fee_type_id: r.fee_type_id,
            fee_type_name: r.fee_type_name,
            fee_category: r.fee_category,
            receipt_count: Number(r.receipt_count),
            total: Number(r.total),
            share: total > 0 ? `${((r.total / total) * 100).toFixed(1)}%` : "—",
          }))}
        />
      )}
    </>
  );
}
