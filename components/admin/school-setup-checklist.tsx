import Link from "next/link";
import { AlertTriangle, Check, CircleDashed } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type SetupCheck = {
  label: string;
  done: boolean;
  /** Why it matters, in the words of what breaks without it. */
  detail: string;
  /**
   * True when the failure mode is SILENT — the school looks fine and simply
   * never does the thing. Those are worth a louder marker than an obviously
   * empty roster, because nobody goes looking for them.
   */
  silent?: boolean;
  href?: string;
  hrefLabel?: string;
};

/**
 * What a newly created school still needs.
 *
 * This exists because most of these fail QUIETLY. A school with no
 * gate_notify_config row records every tap and sends nothing;
 * claim_notifications() returns early on `not found` and writes no row, so it
 * is indistinguishable from a broken trigger until somebody reads the SQL. The
 * same is true of a missing Telegram bot username and a missing active school
 * year. Listing them is cheaper than debugging them one at a time.
 */
export function SchoolSetupChecklist({ checks }: { checks: SetupCheck[] }) {
  const outstanding = checks.filter((c) => !c.done);
  const silentGaps = outstanding.filter((c) => c.silent).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Setup</CardTitle>
          <Badge variant={outstanding.length === 0 ? "secondary" : "outline"}>
            {checks.length - outstanding.length} / {checks.length} done
          </Badge>
        </div>
        <CardDescription>
          {outstanding.length === 0
            ? "This school is fully configured."
            : silentGaps > 0
              ? `${outstanding.length} outstanding. ${silentGaps} of them fail silently — the school will look fine and simply never do it.`
              : `${outstanding.length} outstanding.`}
        </CardDescription>
      </CardHeader>

      <CardContent className="divide-y p-0">
        {checks.map((check) => (
          <div key={check.label} className="flex items-start gap-3 px-6 py-3">
            <span
              className={cn(
                "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
                check.done
                  ? "bg-emerald-500/15 text-emerald-600"
                  : check.silent
                    ? "bg-amber-500/15 text-amber-600"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {check.done ? (
                <Check className="size-3" />
              ) : check.silent ? (
                <AlertTriangle className="size-3" />
              ) : (
                <CircleDashed className="size-3" />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-sm font-medium",
                  check.done && "text-muted-foreground line-through",
                )}
              >
                {check.label}
              </p>
              {!check.done && (
                <p className="mt-0.5 text-xs text-pretty text-muted-foreground">
                  {check.detail}
                </p>
              )}
            </div>

            {!check.done && check.href && (
              <Link
                href={{ pathname: check.href }}
                className="shrink-0 text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                {check.hrefLabel ?? "Fix"}
              </Link>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
