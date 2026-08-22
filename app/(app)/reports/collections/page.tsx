import { FileBarChart, Receipt, Sigma, Wallet } from "lucide-react";
import { requireSchool } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { getFeeTypes, getSchoolYears, resolveSchoolYear } from "@/lib/data/school";
import { getCollectionReport } from "@/lib/reports/queries";
import { formatMoney } from "@/lib/financial/money";
import { formatDate } from "@/lib/utils/dates";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { StatCard } from "@/components/common/stat-card";
import { CollectionReportTable } from "@/components/tables/report-tables";
import { ReportFilters } from "@/components/reports/report-filters";
import { ExportButton } from "@/components/reports/export-button";

export const dynamic = "force-dynamic";

export default async function CollectionReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireSchool();
  const sp = await searchParams;

  const [schoolYear, schoolYears, feeTypes] = await Promise.all([
    resolveSchoolYear(ctx.activeSchool.id, sp.sy),
    getSchoolYears(ctx.activeSchool.id),
    getFeeTypes(ctx.activeSchool.id, false),
  ]);

  if (!schoolYear) {
    return (
      <>
        <PageHeader title="Collection report" />
        <EmptyState icon={FileBarChart} title="No school year yet" />
      </>
    );
  }

  const supabase = await createClient();
  const { data: memberRows } = await supabase
    .from("school_users")
    .select("profile:profiles(id, full_name)")
    .eq("school_id", ctx.activeSchool.id)
    .eq("status", "active");

  const cashiers = ((memberRows ?? []) as unknown as {
    profile: { id: string; full_name: string } | null;
  }[])
    .map((m) => m.profile)
    .filter((p): p is { id: string; full_name: string } => Boolean(p));

  const rows = await getCollectionReport({
    schoolId: ctx.activeSchool.id,
    schoolYearId: schoolYear.id,
    from: sp.from ?? null,
    to: sp.to ?? null,
    feeTypeId: sp.fee ?? null,
    cashierId: sp.cashier ?? null,
    paymentMethod: sp.method ?? null,
  });

  const total = rows.reduce((s, r) => s + r.total_amount, 0);

  return (
    <>
      <PageHeader
        title="Collection report"
        description="Posted receipts only — voided payments are excluded everywhere."
        actions={
          can(ctx.activeRole, "exportReports") ? (
            <ExportButton report="collections" />
          ) : undefined
        }
      />

      <ReportFilters
        schoolYears={schoolYears}
        currentYearId={schoolYear.id}
        feeTypes={feeTypes}
        cashiers={cashiers}
        show={{ dateRange: true, feeType: true, cashier: true, method: true }}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Total collected"
          value={formatMoney(total)}
          tone="positive"
          icon={Wallet}
        />
        <StatCard
          label="Receipts"
          value={rows.length.toLocaleString()}
          icon={Receipt}
        />
        <StatCard
          label="Average receipt"
          value={rows.length ? formatMoney(total / rows.length) : "—"}
          icon={Sigma}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={FileBarChart}
          title="No collections match these filters"
        />
      ) : (
        <CollectionReportTable
          rows={rows.map((r) => ({
            id: r.id,
            date: formatDate(r.collection_date),
            receipt_number: r.receipt_number,
            student_name: r.student_name,
            fee_names: r.fee_names,
            total_amount: Number(r.total_amount),
            payment_method: r.payment_method,
            cashier_name: r.cashier_name,
          }))}
        />
      )}
    </>
  );
}
