import { HandCoins, ListChecks, Wallet } from "lucide-react";

import { requireSchool } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getSchoolYears, resolveSchoolYear } from "@/lib/data/school";
import { getPledges, getPrograms } from "@/lib/data/donations";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { StatCard } from "@/components/common/stat-card";
import { SchoolYearPicker } from "@/components/common/school-year-picker";
import { PledgesTable } from "@/components/tables/pledges-table";
import { PledgeDialog } from "@/components/donations/pledge-dialog";
import { CancelPledgeDialog } from "@/components/donations/cancel-pledge-dialog";
import { formatMoney } from "@/lib/financial/money";

export const dynamic = "force-dynamic";

/**
 * Pledges across every program.
 *
 * The distinction this page exists to hold: pledged is a promise, received is
 * money. A treasurer who reports the two added together has overstated the
 * fund, so they are never summed here.
 */
export default async function PledgesPage({
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
        <PageHeader title="Pledges" />
        <EmptyState icon={ListChecks} title="No school year yet" />
      </>
    );
  }

  const [pledges, programs] = await Promise.all([
    getPledges(ctx.activeSchool.id, schoolYear.id),
    getPrograms(ctx.activeSchool.id, schoolYear.id),
  ]);

  const live = pledges.filter((p) => p.status === "open");
  const pledged = live.reduce((s, p) => s + p.pledged_amount, 0);
  const received = live.reduce((s, p) => s + p.fulfilled_amount, 0);
  const outstanding = live.reduce((s, p) => s + p.remaining_amount, 0);

  const canCancel = can(ctx.activeRole, "cancelPledge");

  return (
    <>
      <PageHeader
        title="Pledges"
        description={`${live.length} live pledge${live.length === 1 ? "" : "s"} · ${schoolYear.name}`}
        actions={
          <>
            <SchoolYearPicker years={schoolYears} current={schoolYear.id} />
            {can(ctx.activeRole, "recordPledge") && (
              <PledgeDialog
                schoolId={ctx.activeSchool.id}
                schoolYearId={schoolYear.id}
                programs={programs}
              />
            )}
          </>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Pledged"
          value={formatMoney(pledged)}
          icon={ListChecks}
          hint="Promised, not yet money"
        />
        <StatCard
          label="Delivered"
          value={formatMoney(received)}
          icon={Wallet}
          tone="positive"
          hint="Cash and goods against those pledges"
        />
        <StatCard
          label="Still to collect"
          value={formatMoney(outstanding)}
          icon={HandCoins}
          tone={outstanding > 0 ? "warning" : "default"}
          hint="Follow-up list"
        />
      </div>

      {pledges.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No pledges yet"
          description="When a parent commits an amount at an assembly, record it here so it can be followed up before the program closes."
        />
      ) : (
        <PledgesTable
          rows={pledges}
          timezone={ctx.activeSchool.timezone}
          rowActions={
            canCancel
              ? (p) =>
                  p.status === "open" ? (
                    <CancelPledgeDialog pledgeId={p.id} donorName={p.donor_name} />
                  ) : null
              : undefined
          }
        />
      )}
    </>
  );
}
