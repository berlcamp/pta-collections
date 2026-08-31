import Image from "next/image";
import { Clock, Info, LogIn, LogOut } from "lucide-react";

import { ChildFilter } from "@/components/portal/child-filter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">{copy.attendanceTitle}</h1>

      <ChildFilter
        students={children}
        selected={student}
        basePath="/portal/attendance"
      />

      {limited && (
        <p className="flex gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {copy.limitedHistory}
        </p>
      )}

      {days.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            {copy.noScans}
          </CardContent>
        </Card>
      )}

      {days.map(([day, dayScans]) => (
        <section key={day} className="space-y-2">
          {/* local_date is computed in SQL, in Asia/Manila (D11). Rendering it
              through toLocaleDateString would re-derive the day from the
              browser's clock and disagree with the school by one day every
              evening. Parsing it as a plain date keeps SQL's answer. */}
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {formatDay(day, session.locale)}
          </h2>

          <Card>
            <CardContent className="divide-y p-0">
              {dayScans.map((scan) => {
                const capture = captures.get(scan.event_id);
                const inbound = scan.direction === "in";
                return (
                  <div key={scan.event_id} className="flex items-center gap-3 p-3">
                    {capture ? (
                      <Image
                        src={capture}
                        alt=""
                        width={48}
                        height={48}
                        unoptimized
                        className="size-12 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div
                        className={
                          inbound
                            ? "grid size-12 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600"
                            : "grid size-12 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
                        }
                      >
                        {inbound ? (
                          <LogIn className="size-5" />
                        ) : (
                          <LogOut className="size-5" />
                        )}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {scan.full_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {inbound ? copy.arrived : copy.left} ·{" "}
                        {new Date(scan.scanned_at).toLocaleTimeString("en-PH", {
                          hour: "numeric",
                          minute: "2-digit",
                          timeZone: "Asia/Manila",
                        })}
                      </p>
                    </div>

                    {scan.queued && (
                      <Badge variant="outline" className="shrink-0 gap-1 text-[10px]">
                        <Clock className="size-3" />
                        {copy.scanDelayed}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </section>
      ))}
    </div>
  );
}

function formatDay(isoDate: string, locale: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(
    locale === "tl" ? "fil-PH" : "en-PH",
    { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" },
  );
}
