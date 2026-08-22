import { Banknote, Printer, Receipt } from "lucide-react";

import { formatMoney } from "@/lib/financial/money";

/**
 * A faithful, static rendering of the Today's collections panel.
 *
 * Deliberately not a screenshot: it is built from the same tokens as the real
 * screen, so it stays correct in dark mode, scales with the type ramp, and can
 * never go stale against a redesign the way a PNG would. The figures are
 * illustrative and the names are placeholders.
 */

const ROWS = [
  { or: "OR-004182", student: "Dela Cruz, Ana M.", fee: "PTA annual dues", amount: 350 },
  { or: "OR-004183", student: "Ramos, Jomar P.", fee: "PTA annual dues", amount: 350 },
  { or: "OR-004184", student: "Villanueva, Kier", fee: "Late payment penalty", amount: 50 },
  { or: "OR-004185", student: "Bautista, Liza R.", fee: "PTA annual dues", amount: 175 },
] as const;

const TOTAL = ROWS.reduce((sum, r) => sum + r.amount, 0);

export function LedgerPreview() {
  return (
    <div className="relative">
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-card text-card-foreground shadow-[0_30px_70px_-25px_oklch(0_0_0/0.55)]">
        {/* Panel header */}
        <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/60 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-7 place-items-center rounded-md bg-primary/12 text-primary">
              <Banknote className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold tracking-tight">
                Today&apos;s collections
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                22 Aug 2026 &middot; Asia/Manila
              </p>
            </div>
          </div>
          <span className="hidden items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-2.5 py-1 text-xs font-medium text-success sm:inline-flex">
            <span className="size-1.5 rounded-full bg-success" />
            Open
          </span>
        </div>

        {/* Summary strip */}
        <dl className="grid grid-cols-3 divide-x divide-border border-b border-border">
          {[
            { label: "Collected", value: formatMoney(TOTAL) },
            { label: "Receipts", value: String(ROWS.length) },
            { label: "Cashier", value: "M. Reyes" },
          ].map((stat) => (
            <div key={stat.label} className="px-5 py-4">
              <dt className="font-mono text-[0.7rem] tracking-widest text-muted-foreground uppercase">
                {stat.label}
              </dt>
              <dd className="mt-1 font-mono text-lg font-semibold tabular-nums">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>

        {/* Rows */}
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border">
              {["OR no.", "Student", "Amount"].map((h, i) => (
                <th
                  key={h}
                  className={`px-5 py-2.5 font-mono text-[0.7rem] font-medium tracking-widest text-muted-foreground uppercase ${
                    i === 2 ? "text-right" : ""
                  } ${i === 1 ? "hidden sm:table-cell" : ""}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.or} className="border-b border-border/60 last:border-0">
                <td className="px-5 py-3 font-mono text-sm text-muted-foreground">
                  {row.or}
                </td>
                <td className="hidden px-5 py-3 sm:table-cell">
                  <span className="block text-sm font-medium">{row.student}</span>
                  <span className="block text-xs text-muted-foreground">
                    {row.fee}
                  </span>
                </td>
                <td className="px-5 py-3 text-right font-mono text-sm font-medium tabular-nums">
                  {formatMoney(row.amount)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/50">
              <td
                colSpan={2}
                className="px-5 py-3 text-sm font-semibold tracking-tight"
              >
                Total for the day
              </td>
              <td className="px-5 py-3 text-right font-mono text-sm font-bold tabular-nums">
                {formatMoney(TOTAL)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* An offset receipt stub, so the composition has a diagonal rather than
          sitting square in its column. Decorative only. */}
      <div
        aria-hidden
        className="absolute -bottom-32 -left-14 hidden w-48 -rotate-6 rounded-xl border border-border/80 bg-card p-4 text-card-foreground shadow-[0_22px_50px_-18px_oklch(0_0_0/0.65)] lg:block"
      >
        <div className="flex items-center gap-2 border-b border-dashed border-border pb-2.5">
          <Receipt className="size-4 text-primary" />
          <span className="font-mono text-xs tracking-widest uppercase">
            OR-004185
          </span>
        </div>
        <div className="space-y-1.5 pt-2.5 font-mono text-xs">
          <div className="flex justify-between text-muted-foreground">
            <span>Dues</span>
            <span className="tabular-nums">{formatMoney(175)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Paid</span>
            <span className="tabular-nums">{formatMoney(175)}</span>
          </div>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
          <Printer className="size-3" />
          58 mm thermal
        </p>
      </div>
    </div>
  );
}
