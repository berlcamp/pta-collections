import { Radio, WifiOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import { formatAgo } from "@/lib/data/gate";
import { formatDateTime } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";
import type { GateDeviceStatus } from "@/types/database.types";

/**
 * Is the thing at the gate still talking to us?
 *
 * This sits above the numbers on purpose. A reader that went silent at 06:40
 * makes "112 present" a lie of omission, and nobody reading the board would
 * know unless the silence is the first thing they see.
 *
 * "Quiet" is not "offline": the device only speaks when a card is tapped, so a
 * gate with no traffic since first bell is silent and perfectly healthy. The
 * threshold below says "stale", never "down".
 */
const STALE_AFTER_S = 3600;

export function DeviceStrip({
  devices,
  timezone,
  nowIso,
}: {
  devices: GateDeviceStatus[];
  timezone: string;
  /** Server-rendered "now", so every card on one paint agrees. */
  nowIso: string;
}) {
  if (devices.length === 0) {
    return (
      <EmptyState
        icon={WifiOff}
        title="No gate reader registered"
        description="Attendance appears once a device is registered in pta.gate_devices for this school. Until then the reader's uploads are rejected — and safely queued on the device, not lost."
      />
    );
  }

  const now = Date.parse(nowIso);

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {devices.map((d) => {
        const silenceS =
          d.last_received_at === null
            ? null
            : Math.max(0, (now - Date.parse(d.last_received_at)) / 1000);
        const stale = silenceS === null || silenceS > STALE_AFTER_S;
        // The device's clock against the server's. This is exactly the length
        // of the last outage it flushed through.
        const lagS =
          d.last_scan_at && d.last_received_at
            ? Math.max(
                0,
                (Date.parse(d.last_received_at) - Date.parse(d.last_scan_at)) / 1000,
              )
            : null;

        return (
          <Card key={d.device_id} className={cn(!d.active && "opacity-60")}>
            <CardContent className="flex items-start gap-3">
              <span
                className={cn(
                  "grid size-10 shrink-0 place-items-center rounded-lg",
                  stale
                    ? "bg-warning/15 text-warning"
                    : "bg-success/10 text-success",
                )}
              >
                {stale ? <WifiOff className="size-5" /> : <Radio className="size-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate font-medium">
                    {d.label ?? d.device_id}
                  </p>
                  {!d.active && <Badge variant="outline">Disabled</Badge>}
                  {stale && <Badge variant="outline">Quiet</Badge>}
                </div>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {d.device_id}
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Last upload {formatAgo(silenceS)}
                  {d.last_received_at &&
                    ` · ${formatDateTime(d.last_received_at, timezone)}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {d.scans_today} scan{d.scans_today === 1 ? "" : "s"} today
                  {lagS !== null && lagS > 60 && (
                    <span className="text-warning">
                      {" "}
                      · last batch was {formatAgo(lagS)} old on arrival
                    </span>
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
