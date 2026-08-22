"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { DataTable, SortableHeader } from "@/components/common/data-table";
import { Badge } from "@/components/ui/badge";

export interface AuditRow {
  id: string;
  when: string;
  action: string;
  action_label: string;
  actor_name: string;
  actor_email: string | null;
  acting_as_super_admin: boolean;
  detail: string;
}

const columns: ColumnDef<AuditRow>[] = [
  {
    accessorKey: "when",
    meta: { label: "When" },
    header: ({ column }) => <SortableHeader column={column} title="When" />,
    cell: ({ row }) => (
      <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">
        {row.original.when}
      </span>
    ),
  },
  {
    accessorKey: "action_label",
    meta: { label: "Action" },
    header: ({ column }) => <SortableHeader column={column} title="Action" />,
    cell: ({ row }) => (
      <span className="font-medium">{row.original.action_label}</span>
    ),
    filterFn: "equalsString",
  },
  {
    accessorKey: "actor_name",
    meta: { label: "By" },
    header: ({ column }) => <SortableHeader column={column} title="By" />,
    cell: ({ row }) => (
      <div className="min-w-0">
        <span className="flex items-center gap-2">
          {row.original.actor_name}
          {row.original.acting_as_super_admin && (
            <Badge variant="outline" className="text-[0.7rem]">
              as Super Admin
            </Badge>
          )}
        </span>
        {row.original.actor_email && (
          <span className="block truncate text-xs text-muted-foreground">
            {row.original.actor_email}
          </span>
        )}
      </div>
    ),
  },
  {
    accessorKey: "detail",
    meta: { label: "Detail" },
    header: "Detail",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="line-clamp-2 max-w-md whitespace-normal text-muted-foreground">
        {row.original.detail}
      </span>
    ),
  },
];

export function AuditLogsTable({ rows }: { rows: AuditRow[] }) {
  const actions = Array.from(new Set(rows.map((r) => r.action_label))).sort();

  return (
    <DataTable
      columns={columns}
      data={rows}
      pageSize={0}
      searchPlaceholder="Search this page…"
      facets={[
        {
          columnId: "action_label",
          title: "Actions",
          options: actions.map((a) => ({ value: a, label: a })),
        },
      ]}
    />
  );
}
