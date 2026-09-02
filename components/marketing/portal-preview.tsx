import { HandCoins, House, IdCard, ScanLine, Wallet } from "lucide-react";

import { formatMoney } from "@/lib/financial/money";

/**
 * The parent portal, in the hand it is actually held in.
 *
 * Same principle as `GatePreview` and `LedgerPreview`: drawn from the app's own
 * tokens rather than screenshotted, so it stays right in dark mode, scales with
 * the type ramp, and cannot go stale against a redesign the way a PNG would.
 *
 * The bezel is `bg-sidebar`, the one colour here that is dark in BOTH themes —
 * a phone with a white frame in light mode stops reading as a phone. It carries
 * an inset ring as well, because in dark mode the bezel and the page behind it
 * are within a few percent of each other and the silhouette dissolves without
 * one: the whole thing stops looking like a device and starts looking like
 * another panel. Figures and names are illustrative.
 */

const TABS = [
  { icon: House, label: "Home", active: true },
  { icon: ScanLine, label: "Gate", active: false },
  { icon: Wallet, label: "Fees", active: false },
  { icon: HandCoins, label: "Give", active: false },
] as const;

export function PortalPreview() {
  return (
    <div className="relative mx-auto w-[270px] sm:w-[290px]">
      <div className="rounded-[2.6rem] bg-sidebar p-2.5 shadow-[0_30px_70px_-25px_oklch(0_0_0/0.5)] ring-1 ring-sidebar-border ring-inset">
        <div className="overflow-hidden rounded-[2.1rem] bg-card text-card-foreground">
          {/* Status bar. The notch is a plain pill rather than a real cut-out:
            at this size the silhouette is what says "phone", not the detail. */}
          <div className="relative flex items-center justify-between bg-sidebar px-5 pt-2 pb-3 font-mono text-[0.65rem] text-sidebar-foreground/80 tabular-nums">
            <span>7:04</span>
            <span
              aria-hidden
              className="absolute top-1.5 left-1/2 h-1.5 w-16 -translate-x-1/2 rounded-full bg-sidebar-foreground/25"
            />
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-3 rounded-[2px] border border-sidebar-foreground/50" />
              <span>84%</span>
            </span>
          </div>

          {/* Who is signed in */}
          <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 font-medium text-primary">
              AD
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">
                Ana M. Dela Cruz
              </p>
              <p className="truncate text-xs text-muted-foreground">
                Grade 7 &mdash; Rizal
              </p>
            </div>
            <IdCard className="ml-auto size-4 shrink-0 text-muted-foreground" />
          </div>

          <div className="space-y-4 px-4 py-4">
            {/* Today at the gate */}
            <div>
              <p className="font-mono text-[0.6rem] tracking-widest text-muted-foreground uppercase">
                Today at the gate
              </p>
              <div className="mt-2 flex items-center gap-3 rounded-xl border border-success/25 bg-success/10 px-3 py-2.5">
                <span className="size-2 shrink-0 rounded-full bg-success" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-success">Tapped in</p>
                  <p className="text-xs text-muted-foreground">Main entrance</p>
                </div>
                <span className="ml-auto font-mono text-sm tabular-nums">
                  7:04 AM
                </span>
              </div>
            </div>

            {/* What is owed */}
            <div>
              <p className="font-mono text-[0.6rem] tracking-widest text-muted-foreground uppercase">
                PTA balance
              </p>
              <div className="mt-2 rounded-xl border border-border px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm">PTA annual dues</span>
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {formatMoney(350)}
                  </span>
                </div>
                <div className="mt-1.5 flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                  <span>Paid {formatMoney(175)}</span>
                  <span className="font-medium text-warning">
                    {formatMoney(175)} due
                  </span>
                </div>
                {/* Half paid, drawn as half a bar. */}
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-1/2 rounded-full bg-primary" />
                </div>
              </div>
            </div>

            <div className="grid w-full place-items-center rounded-xl bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground">
              Pay {formatMoney(175)} by GCash
            </div>
          </div>

          {/* Tab bar */}
          <div className="grid grid-cols-4 border-t border-border bg-muted/50">
            {TABS.map(({ icon: Icon, label, active }) => (
              <div
                key={label}
                className={`flex flex-col items-center gap-1 py-2.5 ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="size-4" />
                <span className="text-[0.6rem]">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
