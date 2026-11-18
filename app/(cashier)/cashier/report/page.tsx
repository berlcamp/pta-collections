import Link from "next/link";
import { FileBarChart, Printer } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getCashierReceipts } from "@/lib/reports/queries";
import { previousDay, resolvePeriod, summarizeCollections } from "@/lib/cashier/report";
import { formatMoney } from "@/lib/financial/money";
import { formatDate, startOfMonthInTimezone, todayInTimezone } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/common/empty-state";
import { ReceiptTable } from "@/components/cashier/receipt-table";
import { portalCard } from "@/components/portal/styles";

export const dynamic = "force-dynamic";

/**
 * What this cashier collected over a period: the sheet they hand in with the
 * cash. It is scoped to the signed-in person. Printing replaces a CSV here,
 * because exportReports excludes cashiers on purpose.
 */
export default async function CashierReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const ctx = await requireRole(["admin", "cashier", "treasurer"]);
  const sp = await searchParams;

  const timeZone = ctx.activeSchool.timezone;
  const today = todayInTimezone(timeZone);
  const yesterday = previousDay(today);
  const monthStart = startOfMonthInTimezone(timeZone);
  const { from, to } = resolvePeriod(sp.from, sp.to, today);

  const rows = await getCashierReceipts({
    schoolId: ctx.activeSchool.id,
    cashierId: ctx.profile.id,
    from,
    to,
  });
  const summary = summarizeCollections(rows);

  const presets = [
    { label: "Today", from: today, to: today },
    { label: "Yesterday", from: yesterday, to: yesterday },
    { label: "This month", from: monthStart, to: today },
  ];

  const period = from === to ? formatDate(from) : `${formatDate(from)} to ${formatDate(to)}`;
  const query = new URLSearchParams({ from, to }).toString();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Collection report</h1>
          <p className="mt-1 text-slate-500">
            Your receipts for {period}.
          </p>
        </div>
        <a
          href={`/print/report/collections?${query}`}
          target="_blank"
          rel="noreferrer"
          className="portal-cta inline-flex h-12 items-center gap-2 rounded-2xl px-5 text-sm font-semibold text-white shadow-lg shadow-blue-900/20 transition-transform active:scale-[0.98] focus-visible:ring-4 focus-visible:ring-blue-300 focus-visible:outline-none"
        >
          <Printer className="size-4" aria-hidden />
          Print report
        </a>
      </header>

      <div className={cn(portalCard, "flex flex-wrap items-end gap-x-6 gap-y-3 p-4")}>
        <nav aria-label="Report period" className="flex gap-1 rounded-2xl bg-slate-100 p-1">
          {presets.map((preset) => {
            const active = preset.from === from && preset.to === to;
            return (
              <Link
                key={preset.label}
                href={`/cashier/report?from=${preset.from}&to=${preset.to}`}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "inline-flex min-h-10 items-center rounded-xl px-4 text-sm font-medium transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:outline-none",
                  active
                    ? "bg-white text-blue-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-900",
                )}
              >
                {preset.label}
              </Link>
            );
          })}
        </nav>

        <form method="get" action="/cashier/report" className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="report-from" className="text-xs">From</Label>
            <Input id="report-from" type="date" name="from" defaultValue={from} max={today} className="h-11 w-40 rounded-xl border-slate-200 bg-white" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="report-to" className="text-xs">To</Label>
            <Input id="report-to" type="date" name="to" defaultValue={to} max={today} className="h-11 w-40 rounded-xl border-slate-200 bg-white" />
          </div>
          <Button type="submit" variant="outline" className="h-11 rounded-xl border-slate-200 bg-white px-5">
            Show
          </Button>
        </form>
      </div>

      <dl className="grid gap-4 sm:grid-cols-3">
        <div className="portal-gradient rounded-3xl p-5 text-white shadow-lg shadow-blue-900/20">
          <dt className="text-sm text-blue-100">Total collected</dt>
          <dd className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
            {formatMoney(summary.total)}
          </dd>
        </div>
        <div className={cn(portalCard, "p-5")}>
          <dt className="text-sm text-slate-500">Cash to hand in</dt>
          <dd className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">
            {formatMoney(summary.cash)}
          </dd>
        </div>
        <div className={cn(portalCard, "p-5")}>
          <dt className="text-sm text-slate-500">Receipts</dt>
          <dd className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">
            {summary.receipts}
            {summary.voided > 0 && (
              <span className="ml-2 text-sm font-normal tracking-normal text-muted-foreground">
                + {summary.voided} voided
              </span>
            )}
          </dd>
        </div>
      </dl>

      {summary.byMethod.length > 1 && (
        <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
          {summary.byMethod.map((m) => (
            <li key={m.method}>
              {m.label}:{" "}
              <span className="font-medium text-foreground tabular-nums">
                {formatMoney(m.total)}
              </span>{" "}
              ({m.receipts})
            </li>
          ))}
        </ul>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={FileBarChart}
          title="No receipts in this period"
          description="Receipts you record will appear here."
        />
      ) : (
        <div className={cn(portalCard, "overflow-x-auto px-5 py-2")}>
          <ReceiptTable rows={rows} timeZone={timeZone} reprint />
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Fee collections only. Donations have their own receipt series and are not
        counted here.
      </p>
    </div>
  );
}
