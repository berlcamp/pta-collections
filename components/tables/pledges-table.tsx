"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { DataTable, SortableHeader } from "@/components/common/data-table";
import { MoneyDisplay } from "@/components/common/money-display";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils/dates";
import type { PledgeFulfilment, PledgeStatusRow } from "@/types/database.types";

/**
 * Fulfilment is DERIVED in pta.v_donation_pledge_status, never stored — the
 * same discipline as charge balances. Nothing here recomputes it.
 */
const FULFILMENT: Record<
  PledgeFulfilment,
  { label: string; className: string; dot: string }
> = {
  open: {
    label: "Outstanding",
    className: "border-warning/30 bg-warning/15 text-warning",
    dot: "bg-warning",
  },
  partially_fulfilled: {
    label: "Partial",
    className: "border-primary/25 bg-primary/10 text-primary",
    dot: "bg-primary",
  },
  fulfilled: {
    label: "Fulfilled",
    className: "border-success/25 bg-success/10 text-success",
    dot: "bg-success",
  },
  cancelled: {
    label: "Cancelled",
    className: "border-border bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
  },
};

export function PledgesTable({
  rows,
  timezone,
  showProgram = true,
  rowActions,
}: {
  rows: PledgeStatusRow[];
  timezone: string;
  showProgram?: boolean;
  /** Rendered at the end of each row — the cancel dialog, when permitted. */
  rowActions?: (pledge: PledgeStatusRow) => React.ReactNode;
}) {
  const columns: ColumnDef<PledgeStatusRow>[] = [
    {
      accessorKey: "donor_name",
      meta: { label: "Donor" },
      header: ({ column }) => <SortableHeader column={column} title="Donor" />,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="font-medium">{row.original.donor_name}</p>
          {row.original.donor_contact && (
            <p className="text-xs text-muted-foreground">
              {row.original.donor_contact}
            </p>
          )}
        </div>
      ),
    },
    ...(showProgram
      ? [
          {
            accessorKey: "program_name",
            meta: { label: "Program" },
            header: ({ column }) => (
              <SortableHeader column={column} title="Program" />
            ),
          } as ColumnDef<PledgeStatusRow>,
        ]
      : []),
    {
      accessorKey: "pledged_amount",
      meta: { label: "Pledged" },
      header: ({ column }) => (
        <SortableHeader column={column} title="Pledged" align="right" />
      ),
      cell: ({ row }) => (
        <div className="text-right">
          <MoneyDisplay amount={row.original.pledged_amount} />
        </div>
      ),
    },
    {
      accessorKey: "fulfilled_amount",
      meta: { label: "Received" },
      header: ({ column }) => (
        <SortableHeader column={column} title="Received" align="right" />
      ),
      cell: ({ row }) => (
        <div className="text-right">
          <MoneyDisplay amount={row.original.fulfilled_amount} muted />
          {row.original.fulfilled_in_kind > 0 && (
            <p className="text-xs text-muted-foreground">
              incl. in kind
            </p>
          )}
        </div>
      ),
    },
    {
      accessorKey: "remaining_amount",
      meta: { label: "Still due" },
      header: ({ column }) => (
        <SortableHeader column={column} title="Still due" align="right" />
      ),
      cell: ({ row }) => (
        <div className="text-right">
          <MoneyDisplay
            amount={row.original.remaining_amount}
            emphasis={row.original.remaining_amount > 0}
            muted={row.original.remaining_amount === 0}
          />
        </div>
      ),
    },
    {
      id: "due_date",
      accessorFn: (r) => r.due_date ?? "",
      meta: { label: "Due" },
      header: ({ column }) => <SortableHeader column={column} title="Due" />,
      cell: ({ row }) =>
        row.original.due_date ? (
          formatDate(row.original.due_date, timezone)
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "fulfilment",
      accessorFn: (r) => FULFILMENT[r.fulfilment_status].label,
      meta: { label: "Status" },
      header: ({ column }) => <SortableHeader column={column} title="Status" />,
      cell: ({ row }) => {
        const s = FULFILMENT[row.original.fulfilment_status];
        return (
          <Badge
            variant="outline"
            className={cn("gap-1.5 font-medium", s.className)}
          >
            <span
              aria-hidden
              className={cn("size-1.5 shrink-0 rounded-full", s.dot)}
            />
            {s.label}
          </Badge>
        );
      },
      filterFn: "equalsString",
    },
    ...(rowActions
      ? [
          {
            id: "actions",
            header: "",
            enableHiding: false,
            enableSorting: false,
            cell: ({ row }) => (
              <div className="flex justify-end">{rowActions(row.original)}</div>
            ),
          } as ColumnDef<PledgeStatusRow>,
        ]
      : []),
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      pageSize={25}
      searchPlaceholder="Search pledges…"
      facets={[
        {
          columnId: "fulfilment",
          title: "Statuses",
          options: [
            { value: "Outstanding", label: "Outstanding" },
            { value: "Partial", label: "Partial" },
            { value: "Fulfilled", label: "Fulfilled" },
            { value: "Cancelled", label: "Cancelled" },
          ],
        },
      ]}
    />
  );
}
