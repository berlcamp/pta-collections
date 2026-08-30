import Link from "next/link";
import { HandCoins, Package, Plus, Users, Wallet } from "lucide-react";

import { requireSchool } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { getSchoolYears, resolveSchoolYear } from "@/lib/data/school";
import { lookupDonationNames } from "@/lib/data/donations";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { StatCard } from "@/components/common/stat-card";
import { ServerPagination } from "@/components/common/server-pagination";
import { SchoolYearPicker } from "@/components/common/school-year-picker";
import {
  DonationsTable,
  type DonationRow,
} from "@/components/tables/donations-table";
import { formatDateTime } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/financial/money";
import type { DonationKind, DonationStatus } from "@/types/database.types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

/**
 * Every donation received, newest first.
 *
 * The three stat cards keep cash and in-kind apart on purpose: only the cash
 * figure is money the school can spend, and a combined "total raised" at the
 * top of this page would be the easiest possible way to overstate the fund.
 */
export default async function DonationsPage({
  searchParams,
}: {
  searchParams: Promise<{ sy?: string; page?: string }>;
}) {
  const ctx = await requireSchool();
  const { sy, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? 1));

  const [schoolYear, schoolYears] = await Promise.all([
    resolveSchoolYear(ctx.activeSchool.id, sy),
    getSchoolYears(ctx.activeSchool.id),
  ]);

  if (!schoolYear) {
    return (
      <>
        <PageHeader title="Donations" />
        <EmptyState icon={HandCoins} title="No school year yet" />
      </>
    );
  }

  const supabase = await createClient();

  const [listRes, totalsRes, programRes] = await Promise.all([
    supabase
      .from("donations")
      .select("*", { count: "exact" })
      .eq("school_id", ctx.activeSchool.id)
      .eq("school_year_id", schoolYear.id)
      .order("donation_date", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    // v_donor_totals is already one row per donor per year, so its row count
    // is the distinct-donor figure. Summing donor_count across programs would
    // count a donor twice for giving to two of them.
    supabase
      .from("v_donor_totals")
      .select("donor_id, cash_given, in_kind_given", { count: "exact" })
      .eq("school_id", ctx.activeSchool.id)
      .eq("school_year_id", schoolYear.id),
    supabase
      .from("v_donation_program_totals")
      .select("cash_received, in_kind_value")
      .eq("school_id", ctx.activeSchool.id)
      .eq("school_year_id", schoolYear.id),
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

  const raw = (listRes.data ?? []) as unknown as Raw[];
  const total = listRes.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const names = await lookupDonationNames(
    raw.map((d) => d.donor_id),
    raw.map((d) => d.program_id),
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
    program_name: names.programs.get(d.program_id) ?? "—",
    kind: d.kind,
    amount: Number(d.amount),
    method: d.payment_method,
    item_description: d.item_description,
    received_by_name: names.profiles.get(d.received_by) ?? "—",
    status: d.status,
  }));

  const donors = totalsRes.count ?? 0;

  // Anonymous gifts have no donor row, so the money totals come from the
  // program view — v_donor_totals cannot see them by construction.
  const programAgg = (programRes.data ?? []) as {
    cash_received: number;
    in_kind_value: number;
  }[];
  const cash = programAgg.reduce((s, t) => s + Number(t.cash_received), 0);
  const inKind = programAgg.reduce((s, t) => s + Number(t.in_kind_value), 0);

  return (
    <>
      <PageHeader
        title="Donations received"
        description={`${total} acknowledgement${total === 1 ? "" : "s"} · ${schoolYear.name}`}
        actions={
          <>
            <SchoolYearPicker years={schoolYears} current={schoolYear.id} />
            {can(ctx.activeRole, "recordDonation") && (
              <Button asChild>
                <Link href="/donations/new">
                  <Plus className="size-4" />
                  Record donation
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Cash received"
          value={formatMoney(cash)}
          icon={Wallet}
          tone="positive"
          hint="Money in hand across every program"
        />
        <StatCard
          label="In-kind value"
          value={formatMoney(inKind)}
          icon={Package}
          hint="Goods and services, estimated"
        />
        <StatCard
          label="Named donors"
          value={donors}
          icon={Users}
          hint="Anonymous gifts are counted but unnamed"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title="No donations yet"
          description="Once a parent or supporter gives to a program, the acknowledgement appears here."
          action={
            can(ctx.activeRole, "recordDonation") ? (
              <Button asChild>
                <Link href="/donations/new">Record the first donation</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          <DonationsTable rows={rows} pageSize={0} />
          <ServerPagination
            page={page}
            pages={pages}
            total={total}
            pageSize={PAGE_SIZE}
            noun="donation"
          />
        </div>
      )}
    </>
  );
}
