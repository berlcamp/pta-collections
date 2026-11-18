import Image from "next/image";
import { Clock, Info, LogIn, LogOut, ScanLine } from "lucide-react";

import { ChildFilter } from "@/components/portal/child-filter";
import {
  EmptyState,
  PortalScreen,
  PortalTopBar,
  SectionTitle,
} from "@/components/portal/screen";
import { portalCard } from "@/components/portal/styles";
import { cn } from "@/lib/utils";
import {
  getPortalChildren,
  getPortalScans,
  groupScansByDay,
  signCaptureUrl,
} from "@/lib/data/portal";
import { t } from "@/lib/portal/i18n";
import { requirePortalSession } from "@/lib/portal/session";

export const dynamic = "force-dynamic";

export default async function PortalAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  const session = await requirePortalSession();
  const copy = t(session.locale);
  const { student } = await searchParams;

  const [children, scans] = await Promise.all([
    getPortalChildren(),
    getPortalScans(student),
  ]);

  // The window itself is enforced in v_portal_attendance, not here. This only
  // decides whether to EXPLAIN it: a non-primary guardian seeing seven days
  // should be told that is deliberate rather than assume the gate is broken.
  const limited = children.some((c) => !c.is_primary);

  // Signed one at a time and only for rows the database already agreed to hand
  // over an image_path for — v_portal_attendance nulls it for a non-primary
  // guardian, and pta.may_view_capture() gates the storage policy underneath.
  const captures = new Map<string, string>();
  for (const scan of scans.slice(0, 40)) {
    if (!scan.image_path) continue;
    const url = await signCaptureUrl(scan.image_path);
    if (url) captures.set(scan.event_id, url);
  }

  const days = groupScansByDay(scans);

  return (
    <PortalScreen
      hero={
        <PortalTopBar backHref="/portal" backLabel={copy.back} title={copy.attendanceTitle} />
      }
    >
      <ChildFilter
        students={children}
        selected={student}
        basePath="/portal/attendance"
        locale={session.locale}
      />

      {limited && (
        <p className="flex gap-2 rounded-2xl bg-blue-50 p-3.5 text-xs leading-relaxed text-blue-900 ring-1 ring-blue-100">
          <Info className="mt-px size-4 shrink-0" />
          {copy.limitedHistory}
        </p>
      )}

      {days.length === 0 && <EmptyState icon={ScanLine}>{copy.noScans}</EmptyState>}

      {days.map(([day, dayScans]) => (
        <section key={day} className="space-y-2">
          {/* local_date is computed in SQL, in Asia/Manila (D11). Rendering it
              through toLocaleDateString would re-derive the day from the
              browser's clock and disagree with the school by one day every
              evening. Parsing it as a plain date keeps SQL's answer. */}
          <SectionTitle>{formatDay(day, session.locale)}</SectionTitle>

          <ul className={cn(portalCard, "divide-y divide-slate-100 overflow-hidden")}>
            {dayScans.map((scan) => {
              const capture = captures.get(scan.event_id);
              const inbound = scan.direction === "in";
              return (
                <li key={scan.event_id} className="flex items-center gap-3 px-4 py-3">
                  {capture ? (
                    <Image
                      src={capture}
                      alt=""
                      width={48}
                      height={48}
                      unoptimized
                      className="size-12 shrink-0 rounded-2xl object-cover"
                    />
                  ) : (
                    <div
                      className={cn(
                        "grid size-12 shrink-0 place-items-center rounded-2xl",
                        inbound ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500",
                      )}
                    >
                      {inbound ? <LogIn className="size-5" /> : <LogOut className="size-5" />}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.95rem] font-medium text-slate-900">
                      {scan.full_name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {inbound ? copy.arrived : copy.left}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="font-mono text-sm font-semibold tabular-nums text-slate-900">
                      {new Date(scan.scanned_at).toLocaleTimeString("en-PH", {
                        hour: "numeric",
                        minute: "2-digit",
                        timeZone: "Asia/Manila",
                      })}
                    </p>
                    {scan.queued && (
                      <p className="mt-0.5 flex items-center justify-end gap-1 text-[0.7rem] text-amber-600">
                        <Clock className="size-3" />
                        {copy.scanDelayed}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </PortalScreen>
  );
}

function formatDay(isoDate: string, locale: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(
    locale === "tl" ? "fil-PH" : "en-PH",
    { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" },
  );
}
