"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Send } from "lucide-react";

import { DataTable, SortableHeader } from "@/components/common/data-table";
import { MoneyDisplay } from "@/components/common/money-display";
import { StudentStatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatNameListing } from "@/lib/utils/names";
import type { StudentGuardianSummary } from "@/lib/data/students";
import type { StudentStatus } from "@/types/database.types";

export interface StudentRow {
  student_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  lrn: string | null;
  birth_date: string | null;
  sex: "M" | "F" | null;
  student_number: string | null;
  grade_level: string;
  section_id: string | null;
  section_name: string | null;
  outstanding: number;
  student_status: StudentStatus;
  /** The one parent on file — the collection contact — or none yet. */
  guardian: StudentGuardianSummary | null;
}

export function studentDisplayName(row: StudentRow): string {
  return formatNameListing(row);
}

export function guardianDisplayName(
  g: StudentGuardianSummary | null,
): string | null {
  return g ? formatNameListing(g) : null;
}

function buildColumns(
  onEdit?: (row: StudentRow) => void,
): ColumnDef<StudentRow>[] {
  const columns: ColumnDef<StudentRow>[] = [
    {
      id: "name",
      accessorFn: studentDisplayName,
      meta: { label: "Student" },
      header: ({ column }) => <SortableHeader column={column} title="Student" />,
      cell: ({ row }) => (
        <Link
          href={`/students/${row.original.student_id}`}
          className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
        >
          {studentDisplayName(row.original)}
        </Link>
      ),
    },
    {
      id: "parent",
      // Sorted and searched on the name alone; the contact number underneath
      // is context, not a second sort key.
      accessorFn: (r) => guardianDisplayName(r.guardian) ?? "",
      meta: { label: "Parent / Guardian" },
      header: ({ column }) => (
        <SortableHeader column={column} title="Parent / Guardian" />
      ),
      cell: ({ row }) => {
        const g = row.original.guardian;
        if (!g) {
          return <span className="text-sm text-muted-foreground">—</span>;
        }
        return (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="truncate font-medium">{guardianDisplayName(g)}</p>
              {/* Whether this parent is reachable at the gate. Linked but
                  inactive is its own state and a silent one — 0013 clears
                  telegram_active when Telegram refuses the chat, and
                  portal_set_notify() clears it when the parent switches
                  notifications off — so it must not read as "connected". */}
              {g.telegram_linked && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant={g.telegram_active ? "secondary" : "outline"}
                      className={`gap-1 px-1.5 text-[10px] ${
                        g.telegram_active ? "" : "text-muted-foreground"
                      }`}
                    >
                      <Send className="size-2.5" />
                      Telegram
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    {g.telegram_active
                      ? "Gate arrivals are delivered to this parent on Telegram."
                      : "Linked, but nothing is being delivered — the parent switched notifications off, or Telegram stopped accepting messages."}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {g.relationship}
              {g.contact_number ? ` · ${g.contact_number}` : ""}
            </p>
          </div>
        );
      },
    },
    {
      // Sorted on the grade alone. The section rides along in the cell rather
      // than in a column of its own: it is only ever read together with the
      // grade, and "Grade 7" with an empty neighbour is not worth a column.
      accessorKey: "grade_level",
      meta: { label: "Grade & section" },
      header: ({ column }) => (
        <SortableHeader column={column} title="Grade & section" />
      ),
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          {row.original.grade_level}
          {row.original.section_name && (
            <span className="text-muted-foreground">
              {" · "}
              {row.original.section_name}
            </span>
          )}
        </span>
      ),
      filterFn: "equalsString",
    },
    {
      accessorKey: "outstanding",
      meta: { label: "Outstanding" },
      header: ({ column }) => (
        <SortableHeader column={column} title="Outstanding" align="right" />
      ),
      cell: ({ row }) => (
        <div className="text-right">
          <MoneyDisplay
            amount={row.original.outstanding}
            muted={row.original.outstanding === 0}
            emphasis={row.original.outstanding > 0}
          />
        </div>
      ),
    },
    {
      accessorKey: "student_status",
      meta: { label: "Status" },
      header: ({ column }) => <SortableHeader column={column} title="Status" />,
      cell: ({ row }) => (
        <StudentStatusBadge status={row.original.student_status} />
      ),
      filterFn: "equalsString",
    },
  ];

  if (onEdit) {
    columns.push({
      id: "actions",
      header: "",
      enableHiding: false,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-right">
          <Button variant="ghost" size="sm" onClick={() => onEdit(row.original)}>
            <Pencil className="size-3.5" />
            Edit
          </Button>
        </div>
      ),
    });
  }

  return columns;
}

/**
 * The list is paged on the server, so the toolbar search here would only ever
 * search the visible page — the URL-driven filter bar above the table is the
 * one that queries every student, parent name included. Sorting and column
 * choice stay client-side, where they cost nothing.
 */
export function StudentsTable({
  rows,
  filters,
  onEdit,
}: {
  rows: StudentRow[];
  filters?: React.ReactNode;
  onEdit?: (row: StudentRow) => void;
}) {
  return (
    <DataTable
      columns={buildColumns(onEdit)}
      data={rows}
      pageSize={0}
      leading={filters}
    />
  );
}
