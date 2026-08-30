import {
  Banknote,
  Building2,
  CreditCard,
  HandCoins,
  Package,
  Smartphone,
  Wallet,
} from "lucide-react";
import { requireSchool } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { resolveSchoolYear } from "@/lib/data/school";
import { todayInTimezone, formatDate, formatDateTime } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/financial/money";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState } from "@/components/common/empty-state";
import { PaymentsTable } from "@/components/tables/payments-table";
import { formatNameListing } from "@/lib/utils/names";
import { lookupNames } from "@/lib/data/hydrate";
import { CashierFilter } from "@/components/collections/cashier-filter";
import { SectionHeader } from "@/components/common/page-header";
import {
  DonationsTable,
  type DonationRow,
} from "@/components/tables/donations-table";
import { lookupDonationNames } from "@/lib/data/donations";

export const dynamic = "force-dynamic";

/**
 * Daily collection summary.
 *
 * D22: cashiers can read every payment in their school, but this view defaults
 * to their own rows — that is the drawer they have to reconcile. Admins and
 * treasurers default to everyone.
 */
export default async function TodayCollectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; cashier?: string }>;
}) {
  const ctx = await requireSchool();
  const { date: dateParam, cashier } = await searchParams;

  const schoolYear = await resolveSchoolYear(ctx.activeSchool.id);
  if (!schoolYear) {
    return (
      <>
        <PageHeader title="Today's collections" />
        <EmptyState icon={Banknote} title="No school year yet" />
      </>
    );
  }

  // The day boundary is the school's, computed the same way SQL computes it (D11).
  const date = dateParam ?? todayInTimezone(ctx.activeSchool.timezone);

  const isCashier = ctx.activeRole === "cashier";
  const defaultCashier = isCashier ? ctx.profile.id : "all";
  const selectedCashier = cashier ?? defaultCashier;

  const supabase = await createClient();

  // Reads the VIEW for its Asia/Manila collection_date, then looks names up
  // separately — PostgREST relationship inference through a view is fragile and
  // fails by returning nulls rather than erroring. See lib/data/hydrate.ts.
  let paymentsQuery = supabase
    .from("v_payments_local")
    .select(
      "id,receipt_number,payment_date,total_amount,payment_method,status," +
        "student_id,collected_by",
    )
    .eq("school_id", ctx.activeSchool.id)
    .eq("collection_date", date)
    .order("payment_date", { ascending: false });

  if (selectedCashier !== "all") {
    paymentsQuery = paymentsQuery.eq("collected_by", selectedCashier);
  }

  // Donations are collected at the same desk, into the same drawer, so they
  // belong on this sheet — but in their own section and their own totals. A
  // single combined figure here would put an in-kind valuation, which is not
  // money, into a number the cashier has to count out at the end of the day.
  let donationsQuery = supabase
    .from("v_donations_local")
    .select(
      "id,acknowledgement_number,donation_date,donor_id,program_id," +
        "is_anonymous,kind,amount,payment_method,item_description," +
        "received_by,status",
    )
    .eq("school_id", ctx.activeSchool.id)
    .eq("collection_date", date)
    .order("donation_date", { ascending: false });

  if (selectedCashier !== "all") {
    donationsQuery = donationsQuery.eq("received_by", selectedCashier);
  }

  const [paymentsRes, cashiersRes, donationsRes] = await Promise.all([
    paymentsQuery,
    supabase
      .from("school_users")
      .select("profile_id, profile:profiles(id, full_name)")
      .eq("school_id", ctx.activeSchool.id)
      .eq("status", "active"),
    donationsQuery,
  ]);

  type Row = {
    id: string;
    receipt_number: string;
    payment_date: string;
    total_amount: number;
    payment_method: "cash" | "gcash" | "bank_transfer" | "other";
    status: "posted" | "voided";
    student_id: string;
    collected_by: string;
  };

  const rows = (paymentsRes.data ?? []) as unknown as Row[];
  const names = await lookupNames(
    rows.map((r) => r.student_id),
    rows.map((r) => r.collected_by),
  );
  const posted = rows.filter((r) => r.status === "posted");

  const byMethod = (m: Row["payment_method"]) =>
    posted.filter((r) => r.payment_method === m).reduce((s, r) => s + Number(r.total_amount), 0);

  const total = posted.reduce((s, r) => s + Number(r.total_amount), 0);

  type DonationRaw = {
    id: string;
    acknowledgement_number: string;
    donation_date: string;
    donor_id: string | null;
    program_id: string;
    is_anonymous: boolean;
    kind: "cash" | "in_kind";
    amount: number;
    payment_method: string | null;
    item_description: string | null;
    received_by: string;
    status: "posted" | "voided";
  };

  const donationRows = (donationsRes.data ?? []) as unknown as DonationRaw[];
  const postedDonations = donationRows.filter((d) => d.status === "posted");
  const donationCash = postedDonations
    .filter((d) => d.kind === "cash")
    .reduce((s, d) => s + Number(d.amount), 0);
  const donationInKind = postedDonations
    .filter((d) => d.kind === "in_kind")
    .reduce((s, d) => s + Number(d.amount), 0);

  const donationNames = await lookupDonationNames(
    donationRows.map((d) => d.donor_id),
    donationRows.map((d) => d.program_id),
    donationRows.map((d) => d.received_by),
  );

  const donationTableRows: DonationRow[] = donationRows.map((d) => ({
    id: d.id,
    acknowledgement_number: d.acknowledgement_number,
    when:
      formatDateTime(d.donation_date, ctx.activeSchool.timezone)
        .split(", ")
        .pop() ?? "",
    donor_name: d.donor_id
      ? (donationNames.donors.get(d.donor_id)?.display_name ?? "—")
      : "—",
    is_anonymous: d.is_anonymous,
    program_name: donationNames.programs.get(d.program_id) ?? "—",
    kind: d.kind,
    amount: Number(d.amount),
    method: d.payment_method,
    item_description: d.item_description,
    received_by_name: donationNames.profiles.get(d.received_by) ?? "—",
    status: d.status,
  }));

  const cashiers = ((cashiersRes.data ?? []) as unknown as {
    profile: { id: string; full_name: string } | null;
  }[])
    .map((c) => c.profile)
    .filter((p): p is { id: string; full_name: string } => Boolean(p));

  return (
    <>
      <PageHeader
        title="Daily collections"
        description={formatDate(date, ctx.activeSchool.timezone)}
        actions={
          <CashierFilter
            cashiers={cashiers}
            selected={selectedCashier}
            date={date}
            lockedToSelf={isCashier ? ctx.profile.id : null}
          />
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Cash" value={formatMoney(byMethod("cash"))} icon={Banknote} />
        <StatCard label="GCash" value={formatMoney(byMethod("gcash"))} icon={Smartphone} />
        <StatCard label="Bank transfer" value={formatMoney(byMethod("bank_transfer"))} icon={Building2} />
        <StatCard label="Other" value={formatMoney(byMethod("other"))} icon={CreditCard} />
        <StatCard
          label="Total"
          value={formatMoney(total)}
          icon={Wallet}
          tone="positive"
          hint={`${posted.length} receipt${posted.length === 1 ? "" : "s"}`}
        />
      </div>

      <div className="mt-6">
        <SectionHeader
          title="Fee collections"
          description="Official receipts issued against student charges."
        />
        {rows.length === 0 ? (
          <EmptyState
            icon={Banknote}
            title="No collections on this date"
            description="Payments recorded on this day will appear here as soon as a receipt is issued."
          />
        ) : (
          <PaymentsTable
            dateLabel="Time"
            rows={rows.map((r) => {
              const s = names.students.get(r.student_id);
              return {
                id: r.id,
                receipt_number: r.receipt_number,
                when:
                  formatDateTime(r.payment_date, ctx.activeSchool.timezone)
                    .split(", ")
                    .pop() ?? "",
                student_name: s ? formatNameListing(s) : "—",
                total_amount: Number(r.total_amount),
                payment_method: r.payment_method,
                cashier_name: names.profiles.get(r.collected_by) ?? "—",
                status: r.status,
              };
            })}
          />
        )}
      </div>

      <div className="mt-10">
        <SectionHeader
          title="Donations"
          description="Voluntary gifts to PTA programs. Numbered in their own series and counted separately from fee collections."
        />

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <StatCard
            label="Donations — cash"
            value={formatMoney(donationCash)}
            icon={HandCoins}
            tone="positive"
            hint="Add this to the drawer alongside fee collections"
          />
          <StatCard
            label="Donations — in kind"
            value={formatMoney(donationInKind)}
            icon={Package}
            hint="Goods and services. Nothing to count out."
          />
        </div>

        {donationTableRows.length === 0 ? (
          <EmptyState
            icon={HandCoins}
            title="No donations on this date"
            description="Gifts to a PTA program appear here once an acknowledgement is issued."
          />
        ) : (
          <DonationsTable rows={donationTableRows} pageSize={0} />
        )}
      </div>
    </>
  );
}
