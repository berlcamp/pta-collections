"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { DataTable, SortableHeader } from "@/components/common/data-table";
import { Badge } from "@/components/ui/badge";
import { MembershipToggle } from "@/components/admin/membership-toggle";
import { cn } from "@/lib/utils";

export interface MemberRow {
  id: string;
  name: string;
  email: string;
  role_label: string;
  status: "active" | "inactive";
  added: string;
  isSelf: boolean;
}

const columns: ColumnDef<MemberRow>[] = [
  {
    accessorKey: "name",
    meta: { label: "Name" },
    header: ({ column }) => <SortableHeader column={column} title="Name" />,
    cell: ({ row }) => (
      <span
        className={cn(
          "font-medium",
          row.original.status === "inactive" && "text-muted-foreground",
        )}
      >
        {row.original.name}
        {row.original.isSelf && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            (you)
          </span>
        )}
      </span>
    ),
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
    filterFn: "equalsString",
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
    filterFn: "equalsString",
  },
  {
    accessorKey: "added",
    meta: { label: "Added" },
    header: ({ column }) => <SortableHeader column={column} title="Added" />,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {row.original.added}
      </span>
    ),
  },
  {
    id: "actions",
    header: "",
    enableHiding: false,
    enableSorting: false,
    cell: ({ row }) =>
      row.original.isSelf ? null : (
        <div className="text-right">
          <MembershipToggle
            schoolUserId={row.original.id}
            status={row.original.status}
            name={row.original.name}
          />
        </div>
      ),
  },
];

export function UsersTable({ rows }: { rows: MemberRow[] }) {
  const roles = Array.from(new Set(rows.map((r) => r.role_label))).sort();

  return (
    <DataTable
      columns={columns}
      data={rows}
      pageSize={25}
      searchPlaceholder="Search name or email…"
      facets={[
        {
          columnId: "role_label",
          title: "Roles",
          options: roles.map((r) => ({ value: r, label: r })),
        },
        {
          columnId: "status",
          title: "Statuses",
          options: [
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ],
        },
      ]}
    />
  );
}

export interface InviteRow {
  id: string;
  full_name: string;
  email: string;
  role_label: string;
  expires: string;
}

const inviteColumns: ColumnDef<InviteRow>[] = [
  {
    accessorKey: "full_name",
    meta: { label: "Name" },
    header: ({ column }) => <SortableHeader column={column} title="Name" />,
    cell: ({ row }) => (
      <span className="font-medium">{row.original.full_name}</span>
    ),
  },
  {
    accessorKey: "email",
    meta: { label: "Email" },
    header: ({ column }) => <SortableHeader column={column} title="Email" />,
  },
  {
    accessorKey: "role_label",
    meta: { label: "Role" },
    header: ({ column }) => <SortableHeader column={column} title="Role" />,
  },
  {
    accessorKey: "expires",
    meta: { label: "Expires" },
    header: ({ column }) => <SortableHeader column={column} title="Expires" />,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {row.original.expires}
      </span>
    ),
  },
];

export function InvitesTable({ rows }: { rows: InviteRow[] }) {
  return (
    <DataTable
      columns={inviteColumns}
      data={rows}
      pageSize={0}
      hideViewOptions
    />
  );
}
