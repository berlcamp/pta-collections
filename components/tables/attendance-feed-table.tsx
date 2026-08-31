"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { CircleHelp, Clock, PackageOpen } from "lucide-react";

import { DataTable, SortableHeader } from "@/components/common/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { dynamicRoute } from "@/lib/routes";
/**
 * The scan feed.
 *
 * Every row says what it actually is: a card passed the reader. It does not say
 * a student was present — with a single reader that is a rule the page applies
 * to the first scan of the day, not something the hardware measured.
 *
 * The two flag badges are not decoration. `queued` means the row arrived after
 * an outage, and `clock_synced = false` means the timestamp was reconstructed
 * from the device's uptime because it had no NTP yet. A board that displayed
 * either as an ordinary arrival time would be quietly making things up.
 */
export interface AttendanceFeedRow {
  event_id: string;
  time: string;
  scanned_at: string;
  student_id: string | null;
  student_name: string | null;
  student_no: string | null;
  section: string | null;
  card_uid: string;
  device_id: string;
  queued: boolean;
  clock_synced: boolean;
}

export function AttendanceFeedTable({
  rows,
  schoolId,
  pageSize = 25,
}: {
  rows: AttendanceFeedRow[];
  /** Carried into the enrolment link so the card lands in the right school. */
  schoolId: string;
  pageSize?: number;
}) {
  const columns: ColumnDef<AttendanceFeedRow>[] = [
    {
      accessorKey: "time",
      meta: { label: "Time" },
      header: ({ column }) => <SortableHeader column={column} title="Time" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5 font-mono tabular-nums">
          {row.original.time}
          {!row.original.clock_synced && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Clock className="size-3.5 text-warning" />
              </TooltipTrigger>
              <TooltipContent>
                Estimated — the reader had no clock yet and this time was
                reconstructed from its uptime.
              </TooltipContent>
            </Tooltip>
          )}
          {row.original.queued && (
            <Tooltip>
              <TooltipTrigger asChild>
                <PackageOpen className="size-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                Delivered late — this scan was held on the device through an
                outage and uploaded afterwards.
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      ),
      sortingFn: (a, b) =>
        a.original.scanned_at.localeCompare(b.original.scanned_at),
    },
    {
      id: "student",
      accessorFn: (r) => r.student_name ?? "Unknown card",
      meta: { label: "Student" },
      header: ({ column }) => <SortableHeader column={column} title="Student" />,
      cell: ({ row }) =>
        row.original.student_id ? (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.student_name}</p>
            <p className="text-xs text-muted-foreground">
              {[row.original.student_no, row.original.section]
                .filter(Boolean)
                .join(" · ") || "—"}
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="destructive">
              <CircleHelp className="size-3.5" />
              Unknown card
            </Badge>
            <Button variant="link" size="sm" className="h-auto p-0" asChild>
              <Link
                href={dynamicRoute(
                  `/super/cards?school=${schoolId}&card=${row.original.card_uid}`,
                )}
              >
                Assign
              </Link>
            </Button>
          </div>
        ),
    },
    {
      accessorKey: "card_uid",
      meta: { label: "Card" },
      header: "Card",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.card_uid}
        </span>
      ),
    },
    {
      accessorKey: "device_id",
      meta: { label: "Reader" },
      header: "Reader",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.device_id}
        </span>
      ),
      filterFn: "equalsString",
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      pageSize={pageSize}
      searchPlaceholder="Search name, card or reader…"
      initialSorting={[{ id: "time", desc: true }]}
    />
  );
}
