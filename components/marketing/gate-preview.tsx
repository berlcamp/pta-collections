import { LogIn, LogOut, Radio, ScanLine, Send } from "lucide-react";

/**
 * A faithful, static rendering of the live gate monitor, with the Telegram
 * message one of those taps produced pinned beside it.
 *
 * Same reasoning as `LedgerPreview`: built from the app's own tokens rather
 * than screenshotted, so it survives dark mode and a redesign. The two halves
 * are shown together on purpose — the whole promise of the gate is that the
 * row on the left and the message on the right are the same event.
 *
 * Names and times are illustrative.
 */

const SCANS = [
  { time: "07:04", student: "Dela Cruz, Ana M.", grade: "Grade 7 — Rizal", direction: "in" },
  { time: "07:03", student: "Ramos, Jomar P.", grade: "Grade 9 — Mabini", direction: "in" },
  { time: "07:01", student: "Villanueva, Kier", grade: "Grade 10 — Bonifacio", direction: "in" },
  { time: "06:58", student: "Bautista, Liza R.", grade: "Grade 8 — Luna", direction: "in" },
] as const;

export function GatePreview() {
  return (
    <div className="relative">
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-card text-card-foreground shadow-[0_30px_70px_-25px_oklch(0_0_0/0.55)]">
        {/* Panel header */}
        <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/60 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-7 place-items-center rounded-md bg-primary/12 text-primary">
              <ScanLine className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold tracking-tight">
                Gate &mdash; Main entrance
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                22 Aug 2026 &middot; Asia/Manila
              </p>
            </div>
          </div>
          <span className="hidden items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-2.5 py-1 text-xs font-medium text-success sm:inline-flex">
            <span className="size-1.5 animate-pulse rounded-full bg-success" />
            Online
          </span>
        </div>

        {/* Summary strip */}
        <dl className="grid grid-cols-3 divide-x divide-border border-b border-border">
          {[
            { label: "Arrived", value: "412" },
            { label: "Alerts sent", value: "389" },
            { label: "Last tap", value: "07:04" },
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
        <ul>
          {SCANS.map((scan) => {
            const Icon = scan.direction === "in" ? LogIn : LogOut;
            return (
              <li
                key={scan.time}
                className="flex items-center gap-4 border-b border-border/60 px-5 py-3 last:border-0"
              >
                <span className="font-mono text-sm tabular-nums text-muted-foreground">
                  {scan.time}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {scan.student}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {scan.grade}
                  </span>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-2.5 py-1 font-mono text-[0.7rem] tracking-widest text-success uppercase">
                  <Icon className="size-3" />
                  {scan.direction}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center gap-2 bg-muted/50 px-5 py-3 text-xs text-muted-foreground">
          <Radio className="size-3.5" />
          Recorded by the reader at the gate, not typed in by anyone.
        </div>
      </div>

      {/* The message that first row produced. Offset so the composition has a
          diagonal, and because the alert is the point of the panel above it. */}
      <div
        aria-hidden
        className="absolute -bottom-36 -left-20 hidden w-60 rotate-3 rounded-xl border border-border/80 bg-card p-4 text-card-foreground shadow-[0_22px_50px_-18px_oklch(0_0_0/0.65)] lg:block"
      >
        <div className="flex items-center gap-2 border-b border-dashed border-border pb-2.5">
          <Send className="size-3.5 text-primary" />
          <span className="font-mono text-[0.7rem] tracking-widest uppercase">
            Telegram
          </span>
          <span className="ml-auto font-mono text-[0.7rem] text-muted-foreground tabular-nums">
            07:04
          </span>
        </div>
        <p className="pt-2.5 text-sm leading-relaxed">
          <span className="font-semibold">Ana</span> tapped in at the{" "}
          <span className="font-medium">Main entrance</span> at 7:04 AM.
        </p>
      </div>
    </div>
  );
}
