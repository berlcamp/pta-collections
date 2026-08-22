import { Users } from "lucide-react";
import { requireSchool } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getSchoolYears, resolveSchoolYear } from "@/lib/data/school";
import { getCashierReport } from "@/lib/reports/queries";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { CashierReportTable } from "@/components/tables/report-tables";
import { ReportFilters } from "@/components/reports/report-filters";
import { ExportButton } from "@/components/reports/export-button";

export const dynamic = "force-dynamic";

export default async function CashierReportPage({
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
        <PageHeader title="Cashier report" />
        <EmptyState icon={Users} title="No school year yet" />
      </>
    );
  }

  const rows = await getCashierReport({
    schoolId: ctx.activeSchool.id,
    schoolYearId: schoolYear.id,
    from: sp.from ?? null,
    to: sp.to ?? null,
  });

  const sum = (k: keyof (typeof rows)[number]) =>
    rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Cashier collection report"
        description="Collections grouped by the person who received the money."
        actions={
          can(ctx.activeRole, "exportReports") ? (
            <ExportButton report="cashiers" />
          ) : undefined
        }
      />

      <ReportFilters
        schoolYears={schoolYears}
        currentYearId={schoolYear.id}
        show={{ dateRange: true }}
      />

      {rows.length === 0 ? (
        <EmptyState icon={Users} title="No collections in this period" />
      ) : (
        <CashierReportTable
          rows={rows.map((r) => ({
            collected_by: r.collected_by,
            cashier_name: r.cashier_name,
            cash_total: Number(r.cash_total),
            gcash_total: Number(r.gcash_total),
            bank_total: Number(r.bank_total),
            other_total: Number(r.other_total),
            receipt_count: Number(r.receipt_count),
            total: Number(r.total),
          }))}
          totals={{
            cash: sum("cash_total"),
            gcash: sum("gcash_total"),
            bank: sum("bank_total"),
            other: sum("other_total"),
            receipts: sum("receipt_count"),
            total: sum("total"),
          }}
        />
      )}
    </>
  );
}
