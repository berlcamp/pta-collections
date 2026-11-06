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
          <h1 className="text-2xl font-semibold tracking-tight">Collection report</h1>
          <p className="mt-1 text-muted-foreground">
            Your receipts for {period}.
          </p>
        </div>
        <Button asChild className="h-11">
          <a href={`/print/report/collections?${query}`} target="_blank" rel="noreferrer">
            <Printer className="size-4" aria-hidden />
            Print report
          </a>
        </Button>
      </header>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 rounded-xl border bg-card p-4">
        <nav aria-label="Report period" className="flex gap-1 rounded-lg bg-muted p-1">
          {presets.map((preset) => {
            const active = preset.from === from && preset.to === to;
            return (
              <Link
                key={preset.label}
                href={`/cashier/report?from=${preset.from}&to=${preset.to}`}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "inline-flex min-h-10 items-center rounded-md px-3 text-sm font-medium transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  active
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
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
            <Input id="report-from" type="date" name="from" defaultValue={from} max={today} className="h-10 w-40" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="report-to" className="text-xs">To</Label>
            <Input id="report-to" type="date" name="to" defaultValue={to} max={today} className="h-10 w-40" />
          </div>
          <Button type="submit" variant="outline" className="h-10">
            Show
          </Button>
        </form>
      </div>

      <dl className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3">
        <div className="bg-card p-4">
          <dt className="text-sm text-muted-foreground">Total collected</dt>
          <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
            {formatMoney(summary.total)}
          </dd>
        </div>
        <div className="bg-card p-4">
          <dt className="text-sm text-muted-foreground">Cash to hand in</dt>
          <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
            {formatMoney(summary.cash)}
          </dd>
        </div>
        <div className="bg-card p-4">
          <dt className="text-sm text-muted-foreground">Receipts</dt>
          <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
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
        <div className="overflow-x-auto rounded-xl border bg-card px-4 py-2">
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
