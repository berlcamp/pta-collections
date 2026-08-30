import Link, { type LinkProps } from "next/link";
import { Package, Target, Users } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MoneyDisplay } from "@/components/common/money-display";
import { formatMoney } from "@/lib/financial/money";
import { cn } from "@/lib/utils";
import type { ProgramStatus, ProgramTotals } from "@/types/database.types";

const STATUS_STYLES: Record<ProgramStatus, string> = {
  planned: "border-border bg-muted text-muted-foreground",
  open: "border-success/25 bg-success/10 text-success",
  closed: "border-border bg-muted text-muted-foreground",
  cancelled: "border-destructive/25 bg-destructive/10 text-destructive",
};

const STATUS_LABELS: Record<ProgramStatus, string> = {
  planned: "Planned",
  open: "Open",
  closed: "Closed",
  cancelled: "Cancelled",
};

/**
 * A program's fundraising at a glance.
 *
 * The bar tracks TOTAL received — cash plus the value of goods — because that
 * is what a parent assembly means by "how far are we". The two are still broken
 * out underneath, since only the cash half reconciles against a drawer.
 */
// Generic over the href the same way next/link is, so typedRoutes still
// verifies each call site instead of the prop widening to a plain string.
export function ProgramProgressCard<T extends string>({
  totals,
  href,
  action,
}: {
  totals: ProgramTotals;
  href?: LinkProps<T>["href"];
  /**
   * A control belonging to this card — the edit button on the programs page.
   * It gets a real slot beside the status badge rather than being floated on
   * top of the card by the caller, which is what used to bury the badge.
   */
  action?: React.ReactNode;
}) {
  const pct = totals.progress_pct;
  const body = (
    <CardContent className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{totals.name}</p>
          {totals.description && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {totals.description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge
            variant="outline"
            className={cn("capitalize", STATUS_STYLES[totals.status])}
          >
            {STATUS_LABELS[totals.status]}
          </Badge>
          {/* Above the stretched link below, so it stays clickable and does
              not navigate the card. */}
          {action && <span className="relative z-20">{action}</span>}
        </div>
      </div>

      <div>
        <div className="flex items-end justify-between gap-3">
          <p className="font-mono text-2xl leading-none font-semibold tabular-nums">
            {formatMoney(totals.total_received)}
          </p>
          {totals.target_amount !== null && (
            <p className="text-xs text-muted-foreground">
              of {formatMoney(totals.target_amount)}
            </p>
          )}
        </div>

        {totals.target_amount !== null && (
          <div
            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={pct ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${totals.name} fundraising progress`}
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width]",
                (pct ?? 0) >= 100 ? "bg-success" : "bg-primary",
              )}
              style={{ width: `${Math.min(pct ?? 0, 100)}%` }}
            />
          </div>
        )}
        {totals.target_amount !== null && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {pct ?? 0}% of target
          </p>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-3 text-xs">
        <Stat label="Cash" value={<MoneyDisplay amount={totals.cash_received} />} />
        <Stat
          label="In kind"
          value={<MoneyDisplay amount={totals.in_kind_value} muted />}
          icon={Package}
        />
        <Stat
          label="Donors"
          value={<span className="font-mono tabular-nums">{totals.donor_count}</span>}
          icon={Users}
        />
        <Stat
          label="Still pledged"
          value={<MoneyDisplay amount={totals.pledge_outstanding} muted />}
          icon={Target}
        />
      </dl>
    </CardContent>
  );

  if (!href) return <Card className="relative">{body}</Card>;

  return (
    <Card className="relative transition-shadow hover:shadow-sm">
      {body}
      {/*
        A "stretched link": the anchor covers the card rather than wrapping it.
        Wrapping put the whole body inside an <a>, which left the caller no way
        to add a button — a <button> inside an <a> is invalid HTML — so the edit
        control had to be floated on top, landing on the status badge.

        Rendered after the content and given z-10, it paints over the body and
        picks up clicks anywhere on the card. Anything that must stay
        interactive (the action slot) opts out with a higher z-index.
      */}
      <Link
        href={href}
        aria-label={totals.name}
        className="absolute inset-0 z-10 rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      />
    </Card>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: typeof Package;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-muted-foreground">
        {Icon && <Icon className="size-3" />}
        {label}
      </dt>
      <dd className="mt-0.5 truncate">{value}</dd>
    </div>
  );
}
