"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Clock, PackageOpen } from "lucide-react";

import { DataTable, SortableHeader } from "@/components/common/data-table";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
/**
 * The roster, answered against today's scans.
 *
 * At 07:30 the useful question is not "who tapped" but "who has not". So this
 * lists every actively enrolled student and sorts arrivals first — the tail of
 * the list is the answer.
 *
 * "Arrived" here means FIRST scan of the day. With one reader that is a rule,
 * and the column header says so rather than pretending the gate knows which
 * way anyone was walking.
 */
export interface RosterStatusRow {
  student_id: string;
  name: string;
  student_no: string | null;
  grade_level: string | null;
  section: string | null;
  arrived_at: string | null;
  arrived_time: string | null;
  estimated: boolean;
  late_delivery: boolean;
  has_card: boolean;
}

export function GateRosterTable({ rows }: { rows: RosterStatusRow[] }) {
  const columns: ColumnDef<RosterStatusRow>[] = [
    {
      accessorKey: "name",
      meta: { label: "Student" },
      header: ({ column }) => <SortableHeader column={column} title="Student" />,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.name}</p>
          <p className="text-xs text-muted-foreground">
            {[row.original.student_no, row.original.section]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
        </div>
      ),
    },
    {
      id: "grade_level",
      accessorFn: (r) => r.grade_level ?? "—",
      meta: { label: "Grade" },
      header: ({ column }) => <SortableHeader column={column} title="Grade" />,
      filterFn: "equalsString",
    },
    {
      id: "status",
      accessorFn: (r) => (r.arrived_at ? "Arrived" : "Not yet"),
      meta: { label: "Status" },
      header: "Status",
      cell: ({ row }) =>
        row.original.arrived_at ? (
          <Badge variant="secondary">Arrived</Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Not yet
          </Badge>
        ),
      filterFn: "equalsString",
    },
    {
      id: "arrived",
      accessorFn: (r) => r.arrived_at ?? "",
      meta: { label: "First scan" },
      header: ({ column }) => (
        <SortableHeader column={column} title="First scan" />
      ),
      cell: ({ row }) =>
        row.original.arrived_time ? (
          <div className="flex items-center gap-1.5 font-mono tabular-nums">
            {row.original.arrived_time}
            {row.original.estimated && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Clock className="size-3.5 text-warning" />
                </TooltipTrigger>
                <TooltipContent>
                  Estimated — the reader had no clock when this was scanned.
                </TooltipContent>
              </Tooltip>
            )}
            {row.original.late_delivery && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <PackageOpen className="size-3.5 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  Uploaded after an outage rather than in real time.
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "card",
      accessorFn: (r) => (r.has_card ? "Has card" : "No card"),
      meta: { label: "Card" },
      header: "Card",
      cell: ({ row }) =>
        row.original.has_card ? (
          <span className="text-xs text-muted-foreground">Issued</span>
        ) : (
          // Worth calling out: this student CANNOT arrive on this board, so
          // their absence from it means nothing at all.
          <Badge variant="outline" className="text-warning">
            No card
          </Badge>
        ),
      filterFn: "equalsString",
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      pageSize={25}
      searchPlaceholder="Search the roster…"
      facets={[
        {
          columnId: "status",
          title: "Statuses",
          options: [
            { value: "Arrived", label: "Arrived" },
            { value: "Not yet", label: "Not yet" },
          ],
        },
        {
          columnId: "card",
          title: "Cards",
          options: [
            { value: "Has card", label: "Has card" },
            { value: "No card", label: "No card" },
          ],
        },
      ]}
      initialSorting={[{ id: "arrived", desc: false }]}
    />
  );
}
