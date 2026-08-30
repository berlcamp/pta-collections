"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Pencil } from "lucide-react";

import { DataTable, SortableHeader } from "@/components/common/data-table";
import { MoneyDisplay } from "@/components/common/money-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils/dates";
import type { Donor, DonorTotals, DonorType } from "@/types/database.types";

const TYPE_LABELS: Record<DonorType, string> = {
  guardian: "Parent / guardian",
  alumnus: "Alumnus",
  staff: "School staff",
  business: "Business",
  government: "Government",
  organization: "Organization",
  other: "Other",
};

export interface DonorRow extends DonorTotals {
  /** The editable record behind the totals, when the caller may edit it. */
  donor: Donor | null;
}

export function DonorsTable({
  rows,
  timezone,
  onEdit,
}: {
  rows: DonorRow[];
  timezone: string;
  onEdit?: (donor: Donor) => void;
}) {
  const columns: ColumnDef<DonorRow>[] = [
    {
      accessorKey: "display_name",
      meta: { label: "Donor" },
      header: ({ column }) => <SortableHeader column={column} title="Donor" />,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="font-medium">{row.original.display_name}</p>
          {row.original.contact_number && (
            <p className="text-xs text-muted-foreground">
              {row.original.contact_number}
            </p>
          )}
        </div>
      ),
    },
    {
      id: "donor_type",
      accessorFn: (r) => TYPE_LABELS[r.donor_type],
      meta: { label: "Type" },
      header: ({ column }) => <SortableHeader column={column} title="Type" />,
      cell: ({ row }) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{TYPE_LABELS[row.original.donor_type]}</Badge>
          {/* Worth surfacing: this donor is also a parent on file, so their
              giving sits alongside their child's fees. */}
          {row.original.guardian_id && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              On file
            </Badge>
          )}
        </div>
      ),
      filterFn: "equalsString",
    },
    {
      accessorKey: "cash_given",
      meta: { label: "Cash" },
      header: ({ column }) => (
        <SortableHeader column={column} title="Cash" align="right" />
      ),
      cell: ({ row }) => (
        <div className="text-right">
          <MoneyDisplay amount={row.original.cash_given} />
        </div>
      ),
    },
    {
      accessorKey: "in_kind_given",
      meta: { label: "In kind" },
      header: ({ column }) => (
        <SortableHeader column={column} title="In kind" align="right" />
      ),
      cell: ({ row }) => (
        <div className="text-right">
          <MoneyDisplay amount={row.original.in_kind_given} muted />
        </div>
      ),
    },
    {
      accessorKey: "total_given",
      meta: { label: "Total" },
      header: ({ column }) => (
        <SortableHeader column={column} title="Total" align="right" />
      ),
      cell: ({ row }) => (
        <div className="text-right">
          <MoneyDisplay amount={row.original.total_given} emphasis />
        </div>
      ),
    },
    {
      accessorKey: "donation_count",
      meta: { label: "Gifts" },
      header: ({ column }) => (
        <SortableHeader column={column} title="Gifts" align="right" />
      ),
      cell: ({ row }) => (
        <p className="text-right font-mono tabular-nums">
          {row.original.donation_count}
        </p>
      ),
    },
    {
      id: "last_donation_at",
      accessorFn: (r) => r.last_donation_at,
      meta: { label: "Last gift" },
      header: ({ column }) => (
        <SortableHeader column={column} title="Last gift" />
      ),
      cell: ({ row }) => formatDate(row.original.last_donation_at, timezone),
    },
    ...(onEdit
      ? [
          {
            id: "actions",
            header: "",
            enableHiding: false,
            enableSorting: false,
            cell: ({ row }) =>
              row.original.donor ? (
                <div className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(row.original.donor!)}
                  >
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                </div>
              ) : null,
          } as ColumnDef<DonorRow>,
        ]
      : []),
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      pageSize={25}
      searchPlaceholder="Search donors…"
      initialSorting={[{ id: "total_given", desc: true }]}
      facets={[
        {
          columnId: "donor_type",
          title: "Types",
          options: (Object.keys(TYPE_LABELS) as DonorType[]).map((t) => ({
            value: TYPE_LABELS[t],
            label: TYPE_LABELS[t],
          })),
        },
      ]}
    />
  );
}
