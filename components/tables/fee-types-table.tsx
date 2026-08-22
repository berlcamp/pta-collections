"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Pencil } from "lucide-react";

import { DataTable, SortableHeader } from "@/components/common/data-table";
import { MoneyDisplay } from "@/components/common/money-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FeeType } from "@/types/database.types";

export function FeeTypesTable({
  feeTypes,
  onEdit,
}: {
  feeTypes: FeeType[];
  onEdit: (ft: FeeType) => void;
}) {
  const columns: ColumnDef<FeeType>[] = [
    {
      accessorKey: "name",
      meta: { label: "Name" },
      header: ({ column }) => <SortableHeader column={column} title="Name" />,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p
            className={cn(
              "font-medium",
              !row.original.active && "text-muted-foreground",
            )}
          >
            {row.original.name}
          </p>
          {row.original.description && (
            <p className="text-xs text-muted-foreground">
              {row.original.description}
            </p>
          )}
        </div>
      ),
    },
    {
      accessorKey: "category",
      meta: { label: "Category" },
      header: ({ column }) => <SortableHeader column={column} title="Category" />,
      cell: ({ row }) => (
        <Badge variant="outline" className="capitalize">
          {row.original.category}
        </Badge>
      ),
      filterFn: "equalsString",
    },
    {
      accessorKey: "default_amount",
      meta: { label: "Default amount" },
      header: ({ column }) => (
        <SortableHeader column={column} title="Default amount" align="right" />
      ),
      cell: ({ row }) => (
        <div className="text-right">
          {row.original.default_amount != null ? (
            <MoneyDisplay amount={row.original.default_amount} />
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
      ),
    },
    {
      id: "is_recurring",
      accessorFn: (r) => (r.is_recurring ? "Yes" : "No"),
      meta: { label: "Recurring" },
      header: ({ column }) => (
        <SortableHeader column={column} title="Recurring" />
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
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={feeTypes}
      pageSize={0}
      searchPlaceholder="Search fee types…"
      facets={[
        {
          columnId: "category",
          title: "Categories",
          options: [
            { value: "annual", label: "Annual" },
            { value: "penalty", label: "Penalty" },
            { value: "special", label: "Special" },
            { value: "other", label: "Other" },
          ],
        },
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
