"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { CircleHelp, IdCardLanyard } from "lucide-react";

import { DataTable, SortableHeader } from "@/components/common/data-table";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { dynamicRoute } from "@/lib/routes";

/**
 * The three tables behind Reports → Attendance.
 *
 * All of them keep the same distinction the migration header insists on: a
 * student who holds no card has no attendance, rather than none recorded. They
 * are filterable as their own group and are never folded into a percentage.
 */

/* -------------------------------------------------------------------------- */
/*  Day by day                                                                */
/* -------------------------------------------------------------------------- */

export interface AttendanceDayRow {
  local_date: string;
  /** Pre-formatted in the school's timezone by the server. */
  date_label: string;
  weekday: string;
  students_present: number;
  /** Students holding a card on the day this report was run. */
  carded: number;
  scans: number;
  unknown_scans: number;
  first_time: string;
  last_time: string;
}

export function AttendanceDayTable({ rows }: { rows: AttendanceDayRow[] }) {
  const columns: ColumnDef<AttendanceDayRow>[] = [
    {
      accessorKey: "local_date",
      meta: { label: "Date" },
      header: ({ column }) => <SortableHeader column={column} title="Date" />,
      cell: ({ row }) => (
        <div className="min-w-0 whitespace-nowrap">
          <p className="font-medium">{row.original.date_label}</p>
          <p className="text-xs text-muted-foreground">{row.original.weekday}</p>
        </div>
      ),
    },
    {
      accessorKey: "students_present",
      meta: { label: "Present" },
      header: ({ column }) => <SortableHeader column={column} title="Present" />,
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">
          {row.original.students_present.toLocaleString()}
        </span>
      ),
    },
    {
      id: "share",
      accessorFn: (r) => (r.carded > 0 ? r.students_present / r.carded : -1),
      meta: { label: "Of carded" },
      header: ({ column }) => (
        <SortableHeader column={column} title="Of carded" />
      ),
      cell: ({ row }) => {
        const { students_present, carded } = row.original;
        if (carded === 0) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <span className="tabular-nums text-muted-foreground">
            {((students_present / carded) * 100).toFixed(1)}%
          </span>
        );
      },
    },
    {
      accessorKey: "scans",
      meta: { label: "Taps" },
      header: ({ column }) => <SortableHeader column={column} title="Taps" />,
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground">
          {row.original.scans.toLocaleString()}
        </span>
      ),
    },
    {
      id: "window",
      accessorFn: (r) => r.first_time,
      meta: { label: "First / last tap" },
      header: "First / last tap",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono text-xs whitespace-nowrap text-muted-foreground">
          {row.original.first_time} – {row.original.last_time}
        </span>
      ),
    },
    {
      accessorKey: "unknown_scans",
      meta: { label: "Unknown" },
      header: ({ column }) => <SortableHeader column={column} title="Unknown" />,
      cell: ({ row }) =>
        row.original.unknown_scans === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="gap-1 text-warning">
                <CircleHelp className="size-3" />
                {row.original.unknown_scans}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              Taps by plastic no student holds. Nobody is counted present for
              these — enrol them under Gate attendance → Card enrolment.
            </TooltipContent>
          </Tooltip>
        ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      pageSize={31}
      hideViewOptions
      initialSorting={[{ id: "local_date", desc: true }]}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  By grade level                                                            */
/* -------------------------------------------------------------------------- */

export interface AttendanceGradeRow {
  grade_level: string;
  enrolled: number;
  carded: number;
  seen: number;
  present_days: number;
  rate: number | null;
}

export function AttendanceGradeTable({ rows }: { rows: AttendanceGradeRow[] }) {
  const columns: ColumnDef<AttendanceGradeRow>[] = [
    {
      accessorKey: "grade_level",
      meta: { label: "Grade" },
      header: ({ column }) => <SortableHeader column={column} title="Grade" />,
      cell: ({ row }) => (
        <span className="font-medium">{row.original.grade_level}</span>
      ),
    },
    {
      accessorKey: "enrolled",
      meta: { label: "Enrolled" },
      header: ({ column }) => <SortableHeader column={column} title="Enrolled" />,
      cell: ({ row }) => (
        <span className="tabular-nums">{row.original.enrolled}</span>
      ),
    },
    {
      accessorKey: "carded",
      meta: { label: "Holding a card" },
      header: ({ column }) => (
        <SortableHeader column={column} title="Holding a card" />
      ),
      cell: ({ row }) => {
        const missing = row.original.enrolled - row.original.carded;
        return (
          <div className="flex items-center gap-2 tabular-nums">
            {row.original.carded}
            {missing > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="gap-1 text-warning">
                    <IdCardLanyard className="size-3" />
                    {missing}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {missing} student{missing === 1 ? "" : "s"} in this grade hold
                  no card and cannot be seen by the gate at all. They are left
                  out of the rate rather than counted absent.
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "seen",
      meta: { label: "Seen at least once" },
      header: ({ column }) => (
        <SortableHeader column={column} title="Seen at least once" />
      ),
      cell: ({ row }) => (
        <span className="tabular-nums">{row.original.seen}</span>
      ),
    },
    {
      id: "rate",
      accessorFn: (r) => r.rate ?? -1,
      meta: { label: "Attendance rate" },
      header: ({ column }) => (
        <SortableHeader column={column} title="Attendance rate" />
      ),
      cell: ({ row }) =>
        row.original.rate === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="font-medium tabular-nums">
            {row.original.rate.toFixed(1)}%
          </span>
        ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      pageSize={0}
      hideViewOptions
      initialSorting={[{ id: "grade_level", desc: false }]}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Student by student                                                        */
/* -------------------------------------------------------------------------- */

export interface AttendanceStudentRow {
  student_id: string;
  full_name: string;
  student_no: string | null;
  grade_level: string | null;
  section_name: string | null;
  has_card: boolean;
  days_present: number;
  scans: number;
  last_seen_label: string | null;
  /** School days in the window, for the "8 of 19" reading. */
  school_days: number;
}

export function AttendanceStudentTable({
  rows,
}: {
  rows: AttendanceStudentRow[];
}) {
  const columns: ColumnDef<AttendanceStudentRow>[] = [
    {
      accessorKey: "full_name",
      meta: { label: "Student" },
      header: ({ column }) => <SortableHeader column={column} title="Student" />,
      cell: ({ row }) => (
        <div className="min-w-0">
          <Link
            href={dynamicRoute(
              `/students/${row.original.student_id}?tab=attendance`,
            )}
            className="truncate font-medium underline-offset-4 hover:text-primary hover:underline"
          >
            {row.original.full_name}
          </Link>
          <p className="text-xs text-muted-foreground">
            {[row.original.student_no, row.original.section_name]
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
      accessorKey: "days_present",
      meta: { label: "Days present" },
      header: ({ column }) => (
        <SortableHeader column={column} title="Days present" />
      ),
      cell: ({ row }) =>
        // A cardless student's zero is not a small number, it is no number.
        // Printing "0 of 19" beside the others would put them at the top of a
        // truancy list they do not belong on.
        row.original.has_card ? (
          <span className="tabular-nums">
            <span className="font-medium">{row.original.days_present}</span>
            <span className="text-muted-foreground">
              {" "}
              of {row.original.school_days}
            </span>
          </span>
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
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-warning">
                No card
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              This student cannot tap at the gate, so nothing here says whether
              they came to school.
            </TooltipContent>
          </Tooltip>
        ),
      filterFn: "equalsString",
    },
    {
      id: "last_seen",
      accessorFn: (r) => r.last_seen_label ?? "",
      meta: { label: "Last seen" },
      header: ({ column }) => (
        <SortableHeader column={column} title="Last seen" />
      ),
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {row.original.last_seen_label ?? "—"}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      pageSize={25}
      searchPlaceholder="Search students…"
      facets={[
        {
          columnId: "card",
          title: "Cards",
          options: [
            { value: "Has card", label: "Has card" },
            { value: "No card", label: "No card" },
          ],
        },
      ]}
      initialSorting={[{ id: "days_present", desc: false }]}
    />
  );
}
