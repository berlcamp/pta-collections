"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import {
  BellOff,
  CircleHelp,
  Clock,
  PackageOpen,
  Send,
  UserX,
} from "lucide-react";

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
 *
 * The Parent column answers the question the office is actually asked — "does
 * the mother know he got here?" — and it answers it about DELIVERY, not about
 * paperwork. `telegram` is true only when the student has a guardian meeting
 * all three conditions pta.claim_notifications() checks before it sends. A
 * guardian who is on file, has linked Telegram, and then muted it is a
 * different state from one who never linked, and they get different badges:
 * showing "not linked" for a parent who linked last term would send the office
 * chasing a setup step that is already done.
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
  /** Null for an unknown card: there is no student, so there is no question to
   *  answer. Distinct from a student with nobody on file, which is a finding. */
  guardian: GuardianCell | null;
}

export interface GuardianCell {
  name: string;
  relationship: string | null;
  total: number;
  linked: number;
  reachable: number;
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
      header: ({ column }) => (
        <SortableHeader column={column} title="Student" />
      ),
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
      id: "parent",
      accessorFn: (r) => r.guardian?.name ?? "",
      meta: { label: "Parent" },
      header: ({ column }) => <SortableHeader column={column} title="Parent" />,
      cell: ({ row }) => {
        const g = row.original.guardian;

        // No student behind the tap. Nothing is missing — the question does not
        // apply — so this must not look like a school that failed to record a
        // parent. The unknown card is already flagged in the Student column.
        if (!row.original.student_id) {
          return <span className="text-muted-foreground">—</span>;
        }

        if (!g) {
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-warning">
                  <UserX className="size-3.5" />
                  No parent on file
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                Nobody is linked to this student, so no arrival message can be
                sent. Add a parent or guardian on the student&apos;s record.
              </TooltipContent>
            </Tooltip>
          );
        }

        const others = g.total - 1;

        return (
          <div className="min-w-0">
            <p className="truncate font-medium">{g.name}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              {g.reachable > 0 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="border-success/30 bg-success/10 text-success"
                    >
                      <Send className="size-3 " />
                      Telegram
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    {g.reachable === 1
                      ? "This guardian gets a Telegram message when the card taps."
                      : `${g.reachable} of this student's guardians get a Telegram message when the card taps.`}
                  </TooltipContent>
                </Tooltip>
              ) : g.linked > 0 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-muted-foreground">
                      <BellOff className="size-3" />
                      Muted
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    Telegram is linked but alerts are switched off — either the
                    guardian sent /stop to the bot, or notifications are off on
                    their link to this student. Nothing is sent.
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-muted-foreground">
                      <BellOff className="size-3" />
                      Not linked
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    No Telegram yet, so this tap sends nothing. The parent links
                    it themselves from the portal, in one tap.
                  </TooltipContent>
                </Tooltip>
              )}
              <span className="truncate text-xs text-muted-foreground">
                {[g.relationship, others > 0 ? `+${others} more` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
          </div>
        );
      },
      sortingFn: (a, b) =>
        (b.original.guardian?.reachable ?? -1) -
          (a.original.guardian?.reachable ?? -1) ||
        (a.original.guardian?.name ?? "").localeCompare(
          b.original.guardian?.name ?? "",
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
      searchPlaceholder="Search student, parent, card or reader…"
      initialSorting={[{ id: "time", desc: true }]}
    />
  );
}
