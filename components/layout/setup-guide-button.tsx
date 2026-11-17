"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AlertTriangle, ArrowRight, Check, Rocket } from "lucide-react";

import type { SetupCheck } from "@/components/admin/school-setup-checklist";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * The header's "Setup" button and the guide it opens.
 *
 * Rendered by AppShell only while at least one step is outstanding, so it
 * disappears by itself the request after the last one is done. Every step's
 * state is computed from the database (lib/setup/school-setup.ts) — nothing
 * here is ticked by hand, because a tick that can disagree with the data is
 * exactly the kind of quiet failure this guide exists to surface.
 */
export function SetupGuideButton({
  schoolName,
  checks,
}: {
  schoolName: string;
  checks: SetupCheck[];
}) {
  const [open, setOpen] = useState(false);

  const done = checks.filter((c) => c.done).length;
  const total = checks.length;
  const pct = total === 0 ? 100 : Math.round((done / total) * 100);
  const nextIndex = checks.findIndex((c) => !c.done);
  const silentGaps = checks.filter((c) => !c.done && c.silent).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-2 border-primary/30 px-2.5 sm:px-3"
          aria-label={`School setup: ${done} of ${total} steps done`}
        >
          <ProgressRing value={pct} />
          <span className="hidden sm:inline">Setup</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {done}/{total}
          </span>
        </Button>
      </DialogTrigger>

      <DialogContent className="flex max-h-[min(42rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="gap-3 border-b p-5 pr-12">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <Rocket className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-lg">Set up {schoolName}</DialogTitle>
              <DialogDescription className="mt-1">
                {done} of {total} steps done
                {silentGaps > 0 && (
                  <>
                    {" "}· {silentGaps} would fail silently — the school looks fine
                    and simply never does it.
                  </>
                )}
              </DialogDescription>
            </div>
          </div>

          <div
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
              style={{ width: `${pct}%` }}
            />
          </div>
        </DialogHeader>

        <ol className="min-h-0 flex-1 divide-y overflow-y-auto">
          {checks.map((check, i) => {
            const isNext = i === nextIndex;
            return (
              <li
                key={check.label}
                className={cn(
                  "flex gap-3 px-5 py-4",
                  isNext && "bg-primary/5",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums",
                    check.done
                      ? "bg-success text-success-foreground"
                      : isNext
                        ? "bg-primary text-primary-foreground"
                        : "border bg-background text-muted-foreground",
                  )}
                >
                  {check.done ? <Check className="size-3.5" /> : i + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p
                      className={cn(
                        "text-sm font-medium",
                        check.done && "text-muted-foreground",
                      )}
                    >
                      <span className="sr-only">
                        {check.done ? "Done: " : "To do: "}
                      </span>
                      {check.label}
                    </p>
                    {isNext && <Badge>Next</Badge>}
                    {!check.done && check.silent && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
                        <AlertTriangle className="size-3" aria-hidden />
                        Fails silently
                      </span>
                    )}
                  </div>

                  {!check.done && (
                    <p className="mt-1 text-xs text-pretty text-muted-foreground">
                      {check.detail}
                    </p>
                  )}

                  {!check.done && check.href && (
                    <Button
                      asChild
                      size="sm"
                      variant={isNext ? "default" : "outline"}
                      className="mt-3"
                    >
                      <Link
                        href={check.href as Route}
                        onClick={() => setOpen(false)}
                      >
                        {check.hrefLabel ?? "Open"}
                        <ArrowRight aria-hidden />
                      </Link>
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        <DialogFooter className="m-0 items-center rounded-none sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Steps tick themselves off from the school&apos;s data. This button
            goes away once all {total} are done.
          </p>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProgressRing({ value }: { value: number }) {
  const r = 7;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 18 18" className="size-[18px] -rotate-90" aria-hidden>
      <circle cx="9" cy="9" r={r} fill="none" strokeWidth="2.5" className="stroke-muted" />
      <circle
        cx="9"
        cy="9"
        r={r}
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value / 100)}
        className="stroke-primary"
      />
    </svg>
  );
}
