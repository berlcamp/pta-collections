"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable, SortableHeader } from "@/components/common/data-table";
import { MoneyDisplay } from "@/components/common/money-display";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface SchoolRow {
  id: string;
  name: string;
  school_code: string;
  active: boolean;
  students: number;
  collected: number;
  outstanding: number;
  last_activity: string;
}

const columns: ColumnDef<SchoolRow>[] = [
  {
    accessorKey: "name",
    meta: { label: "School" },
    header: ({ column }) => <SortableHeader column={column} title="School" />,
    cell: ({ row }) => (
      <div className="min-w-0">
        <Link
          href={`/super/schools/${row.original.id}`}
          className={cn(
            "font-medium underline-offset-4 hover:text-primary hover:underline",
            !row.original.active && "text-muted-foreground",
          )}
        >
          {row.original.name}
        </Link>
        <span className="block font-mono text-xs text-muted-foreground">
          {row.original.school_code}
        </span>
      </div>
    ),
  },
  {
    id: "status",
    accessorFn: (r) => (r.active ? "Active" : "Inactive"),
    meta: { label: "Status" },
    header: ({ column }) => <SortableHeader column={column} title="Status" />,
    cell: ({ row }) => (
      <Badge
        variant="outline"
        className={cn(
          row.original.active
            ? "border-success/25 bg-success/10 text-success"
            : "text-muted-foreground",
        )}
      >
        {row.original.active ? "Active" : "Inactive"}
      </Badge>
    ),
    filterFn: "equalsString",
  },
  {
    accessorKey: "students",
    meta: { label: "Students" },
    header: ({ column }) => (
      <SortableHeader column={column} title="Students" align="right" />
    ),
    cell: ({ row }) => (
      <div className="text-right font-mono tabular-nums">
        {row.original.students.toLocaleString()}
      </div>
    ),
  },
  {
    accessorKey: "collected",
    meta: { label: "Collected" },
    header: ({ column }) => (
      <SortableHeader column={column} title="Collected" align="right" />
    ),
    cell: ({ row }) => (
      <div className="text-right">
        <MoneyDisplay amount={row.original.collected} />
      </div>
    ),
  },
  {
    accessorKey: "outstanding",
    meta: { label: "Outstanding" },
    header: ({ column }) => (
      <SortableHeader column={column} title="Outstanding" align="right" />
    ),
    cell: ({ row }) => (
      <div className="text-right">
        <MoneyDisplay amount={row.original.outstanding} muted />
      </div>
    ),
  },
  {
    accessorKey: "last_activity",
    meta: { label: "Last activity" },
    header: ({ column }) => (
      <SortableHeader column={column} title="Last activity" />
    ),
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {row.original.last_activity}
      </span>
    ),
  },
];

export function SchoolsTable({ rows }: { rows: SchoolRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      pageSize={25}
      searchPlaceholder="Search schools…"
      facets={[
        {
          columnId: "status",
          title: "Statuses",
          options: [
            { value: "Active", label: "Active" },
            { value: "Inactive", label: "Inactive" },
          ],
        },
      ]}
    />
  );
}

export interface SchoolMemberRow {
  id: string;
  name: string;
  email: string;
  role_label: string;
  status: string;
}

const memberColumns: ColumnDef<SchoolMemberRow>[] = [
  {
    accessorKey: "name",
    meta: { label: "Name" },
    header: ({ column }) => <SortableHeader column={column} title="Name" />,
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  },
  {
    accessorKey: "email",
    meta: { label: "Email" },
    header: ({ column }) => <SortableHeader column={column} title="Email" />,
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.email}</span>
    ),
  },
  {
    accessorKey: "role_label",
    meta: { label: "Role" },
    header: ({ column }) => <SortableHeader column={column} title="Role" />,
  },
  {
    accessorKey: "status",
    meta: { label: "Status" },
    header: ({ column }) => <SortableHeader column={column} title="Status" />,
    cell: ({ row }) => (
      <Badge
        variant="outline"
        className={cn(
          "capitalize",
          row.original.status === "active"
            ? "border-success/25 bg-success/10 text-success"
            : "text-muted-foreground",
        )}
      >
        {row.original.status}
      </Badge>
    ),
  },
];

export function SchoolMembersTable({ rows }: { rows: SchoolMemberRow[] }) {
  return (
    <DataTable columns={memberColumns} data={rows} pageSize={0} hideViewOptions />
  );
}
