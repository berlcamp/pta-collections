"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable, SortableHeader } from "@/components/common/data-table";
import { MoneyDisplay } from "@/components/common/money-display";
import { StudentStatusBadge } from "@/components/common/status-badge";
import type { StudentStatus } from "@/types/database.types";

export interface StudentRow {
  student_id: string;
  name: string;
  student_number: string | null;
  grade_level: string;
  section_name: string | null;
  outstanding: number;
  student_status: StudentStatus;
}

const columns: ColumnDef<StudentRow>[] = [
  {
    accessorKey: "name",
    meta: { label: "Student" },
    header: ({ column }) => <SortableHeader column={column} title="Student" />,
    cell: ({ row }) => (
      <Link
        href={`/students/${row.original.student_id}`}
        className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    accessorKey: "student_number",
    meta: { label: "Student no." },
    header: ({ column }) => (
      <SortableHeader column={column} title="Student no." />
    ),
    cell: ({ row }) => (
      <span className="font-mono text-sm text-muted-foreground">
        {row.original.student_number ?? "—"}
      </span>
    ),
  },
  {
    accessorKey: "grade_level",
    meta: { label: "Grade" },
    header: ({ column }) => <SortableHeader column={column} title="Grade" />,
    filterFn: "equalsString",
  },
  {
    accessorKey: "section_name",
    meta: { label: "Section" },
    header: ({ column }) => <SortableHeader column={column} title="Section" />,
    cell: ({ row }) => row.original.section_name ?? "—",
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
    cell: ({ row }) => <StudentStatusBadge status={row.original.student_status} />,
    filterFn: "equalsString",
  },
];

/**
 * The list is paged on the server, so the toolbar search here would only ever
 * search the visible page — the URL-driven filter bar above the table is the
 * one that queries every student. Sorting and column choice stay client-side,
 * where they cost nothing.
 */
export function StudentsTable({
  rows,
  filters,
}: {
  rows: StudentRow[];
  filters?: React.ReactNode;
}) {
  return (
    <DataTable columns={columns} data={rows} pageSize={0} leading={filters} />
  );
}
