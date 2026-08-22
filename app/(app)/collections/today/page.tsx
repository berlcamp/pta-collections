import { Banknote, Building2, CreditCard, Smartphone, Wallet } from "lucide-react";
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

  const [paymentsRes, cashiersRes] = await Promise.all([
    paymentsQuery,
    supabase
      .from("school_users")
      .select("profile_id, profile:profiles(id, full_name)")
      .eq("school_id", ctx.activeSchool.id)
      .eq("status", "active"),
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
    </>
  );
}
