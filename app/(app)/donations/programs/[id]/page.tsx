import Link from "next/link";
import { notFound } from "next/navigation";
import { HandCoins, Plus } from "lucide-react";

import { requireSchool } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  getProgramTotal,
  getPledges,
  getPrograms,
  lookupDonationNames,
} from "@/lib/data/donations";
import { Button } from "@/components/ui/button";
import { PageHeader, SectionHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { ProgramProgressCard } from "@/components/donations/program-progress";
import { PledgeDialog } from "@/components/donations/pledge-dialog";
import { CancelPledgeDialog } from "@/components/donations/cancel-pledge-dialog";
import { PledgesTable } from "@/components/tables/pledges-table";
import {
  DonationsTable,
  type DonationRow,
} from "@/components/tables/donations-table";
import { formatDateTime } from "@/lib/utils/dates";
import type { DonationKind, DonationStatus } from "@/types/database.types";

export const dynamic = "force-dynamic";

export default async function ProgramDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireSchool();
  const { id } = await params;

  const totals = await getProgramTotal(id);
  // RLS already hides another school's program, but checking the tenant here
  // turns a wrong-school link into a 404 rather than a blank page.
  if (!totals || totals.school_id !== ctx.activeSchool.id) notFound();

  const supabase = await createClient();

  const [donationsRes, pledges, programs] = await Promise.all([
    supabase
      .from("donations")
      .select("*")
      .eq("program_id", id)
      .order("donation_date", { ascending: false })
      .limit(500),
    getPledges(ctx.activeSchool.id, totals.school_year_id, { programId: id }),
    getPrograms(ctx.activeSchool.id, totals.school_year_id),
  ]);

  type Raw = {
    id: string;
    acknowledgement_number: string;
    donation_date: string;
    donor_id: string | null;
    program_id: string;
    is_anonymous: boolean;
    kind: DonationKind;
    amount: number;
    payment_method: string | null;
    item_description: string | null;
    received_by: string;
    status: DonationStatus;
  };

  const raw = (donationsRes.data ?? []) as unknown as Raw[];
  const names = await lookupDonationNames(
    raw.map((d) => d.donor_id),
    [id],
    raw.map((d) => d.received_by),
  );

  const rows: DonationRow[] = raw.map((d) => ({
    id: d.id,
    acknowledgement_number: d.acknowledgement_number,
    when: formatDateTime(d.donation_date, ctx.activeSchool.timezone),
    donor_name: d.donor_id
      ? (names.donors.get(d.donor_id)?.display_name ?? "—")
      : "—",
    is_anonymous: d.is_anonymous,
    program_name: totals.name,
    kind: d.kind,
    amount: Number(d.amount),
    method: d.payment_method,
    item_description: d.item_description,
    received_by_name: names.profiles.get(d.received_by) ?? "—",
    status: d.status,
  }));

  const canCancelPledge = can(ctx.activeRole, "cancelPledge");

  return (
    <>
      <PageHeader
        title={totals.name}
        description={totals.description ?? "Program details and giving history."}
        actions={
          <>
            {can(ctx.activeRole, "recordPledge") && totals.accepts_pledges && (
              <PledgeDialog
                schoolId={ctx.activeSchool.id}
                schoolYearId={totals.school_year_id}
                programs={programs}
                presetProgramId={id}
              />
            )}
            {can(ctx.activeRole, "recordDonation") && totals.status === "open" && (
              <Button asChild>
                <Link href={`/donations/new?program=${id}`}>
                  <Plus className="size-4" />
                  Record donation
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="mb-8 max-w-md">
        <ProgramProgressCard totals={totals} />
      </div>

      <section className="mb-8">
        <SectionHeader
          title="Pledges"
          description="Promises made to this program. Nothing here is counted as collected."
        />
        {pledges.length === 0 ? (
          <EmptyState
            icon={HandCoins}
            title="No pledges yet"
            description={
              totals.accepts_pledges
                ? "Commitments made at an assembly can be recorded here and followed up later."
                : "This program does not accept pledges."
            }
          />
        ) : (
          <PledgesTable
            rows={pledges}
            timezone={ctx.activeSchool.timezone}
            showProgram={false}
            rowActions={
              canCancelPledge
                ? (p) =>
                    p.status === "open" ? (
                      <CancelPledgeDialog
                        pledgeId={p.id}
                        donorName={p.donor_name}
                      />
                    ) : null
                : undefined
            }
          />
        )}
      </section>

      <section>
        <SectionHeader title="Donations received" />
        {rows.length === 0 ? (
          <EmptyState
            icon={HandCoins}
            title="No donations to this program yet"
          />
        ) : (
          <DonationsTable rows={rows} />
        )}
      </section>
    </>
  );
}
