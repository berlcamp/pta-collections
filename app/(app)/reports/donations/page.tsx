import { Gift, Package, Users, Wallet } from "lucide-react";

import { requireSchool } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getSchoolYears, resolveSchoolYear } from "@/lib/data/school";
import { getProgramTotals } from "@/lib/data/donations";
import { getDonationReport } from "@/lib/reports/queries";
import { PageHeader, SectionHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { StatCard } from "@/components/common/stat-card";
import { ReportFilters } from "@/components/reports/report-filters";
import { ExportButton } from "@/components/reports/export-button";
import { ProgramProgressCard } from "@/components/donations/program-progress";
import {
  DonationsTable,
  type DonationRow,
} from "@/components/tables/donations-table";
import { formatDate } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/financial/money";

export const dynamic = "force-dynamic";

/**
 * The donation report.
 *
 * Cash and in-kind are totalled separately at the top and never added into a
 * single headline figure — the cash line is the only one that reconciles
 * against a bank deposit, and conflating them is how a PTA ends up reporting
 * money it does not have.
 */
export default async function DonationReportPage({
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
        <PageHeader title="Donation report" />
        <EmptyState icon={Gift} title="No school year yet" />
      </>
    );
  }

  const [rows, programTotals] = await Promise.all([
    getDonationReport({
      schoolId: ctx.activeSchool.id,
      schoolYearId: schoolYear.id,
      from: sp.from ?? null,
      to: sp.to ?? null,
      paymentMethod: sp.method ?? null,
    }),
    getProgramTotals(ctx.activeSchool.id, schoolYear.id),
  ]);

  const cash = rows
    .filter((r) => r.kind === "cash")
    .reduce((s, r) => s + r.amount, 0);
  const inKind = rows
    .filter((r) => r.kind === "in_kind")
    .reduce((s, r) => s + r.amount, 0);
  // Counted by donor id, not by display name — two donors can legitimately
  // share a name, and an anonymous gift has no identity to count at all.
  const namedDonors = new Set(
    rows.map((r) => r.donor_id).filter((id): id is string => id !== null),
  ).size;

  const period =
    sp.from || sp.to
      ? `${sp.from ? formatDate(sp.from, ctx.activeSchool.timezone) : "the beginning"} – ${
          sp.to ? formatDate(sp.to, ctx.activeSchool.timezone) : "today"
        }`
      : schoolYear.name;

  const tableRows: DonationRow[] = rows.map((r) => ({
    id: r.id,
    acknowledgement_number: r.acknowledgement_number,
    when: formatDate(r.collection_date, ctx.activeSchool.timezone),
    donor_name: r.donor_name,
    is_anonymous: r.is_anonymous,
    program_name: r.program_name,
    kind: r.kind,
    amount: r.amount,
    method: r.payment_method,
    item_description: r.item_description,
    received_by_name: r.received_by_name,
    status: "posted",
  }));

  return (
    <>
      <PageHeader
        title="Donation report"
        description={`Voluntary giving to PTA programs · ${period}`}
        actions={
          can(ctx.activeRole, "exportReports") ? (
            <ExportButton report="donations" />
          ) : undefined
        }
      />

      <ReportFilters
        schoolYears={schoolYears}
        currentYearId={schoolYear.id}
        show={{ dateRange: true, method: true }}
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Cash donated"
          value={formatMoney(cash)}
          icon={Wallet}
          tone="positive"
          hint="Reconciles against the bank"
        />
        <StatCard
          label="In-kind value"
          value={formatMoney(inKind)}
          icon={Package}
          hint="Goods and services, never cash"
        />
        <StatCard
          label="Named donors"
          value={namedDonors}
          icon={Users}
          hint={`${rows.length} gift${rows.length === 1 ? "" : "s"} in this period`}
        />
      </div>

      {programTotals.length > 0 && (
        <section className="mb-8">
          <SectionHeader
            title="By program"
            description="Whole-year figures — these ignore the date filter above, because a fundraising target is judged across the year, not a slice of it."
          />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {programTotals.map((t) => (
              <ProgramProgressCard
                key={t.program_id}
                totals={t}
                href={`/donations/programs/${t.program_id}`}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHeader title="Every donation in this period" />
        {tableRows.length === 0 ? (
          <EmptyState icon={Gift} title="No donations in this period" />
        ) : (
          <DonationsTable rows={tableRows} />
        )}
      </section>
    </>
  );
}
