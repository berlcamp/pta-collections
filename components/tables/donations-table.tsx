"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Package, Printer } from "lucide-react";

import { DataTable, SortableHeader } from "@/components/common/data-table";
import { MoneyDisplay } from "@/components/common/money-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DonationKind, DonationStatus } from "@/types/database.types";

export interface DonationRow {
  id: string;
  acknowledgement_number: string;
  when: string;
  donor_name: string;
  is_anonymous: boolean;
  program_name: string;
  kind: DonationKind;
  amount: number;
  /** Null for in-kind — there was no money, so there is no method. */
  method: string | null;
  item_description: string | null;
  received_by_name: string;
  status: DonationStatus;
}

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  gcash: "GCash",
  bank_transfer: "Bank transfer",
  other: "Other",
};

export function DonationsTable({
  rows,
  filters,
  searchable = true,
  pageSize = 25,
}: {
  rows: DonationRow[];
  filters?: React.ReactNode;
  searchable?: boolean;
  pageSize?: number;
}) {
  const columns: ColumnDef<DonationRow>[] = [
    {
      accessorKey: "acknowledgement_number",
      meta: { label: "Acknowledgement" },
      header: ({ column }) => (
        <SortableHeader column={column} title="Acknowledgement" />
      ),
      cell: ({ row }) => (
        <div className="min-w-0">
          <p
            className={cn(
              "font-mono text-xs font-medium",
              row.original.status === "voided" &&
                "text-muted-foreground line-through",
            )}
          >
            {row.original.acknowledgement_number}
          </p>
          <p className="text-xs text-muted-foreground">{row.original.when}</p>
        </div>
      ),
    },
    {
      accessorKey: "donor_name",
      meta: { label: "Donor" },
      header: ({ column }) => <SortableHeader column={column} title="Donor" />,
      cell: ({ row }) =>
        row.original.is_anonymous ? (
          <span className="text-muted-foreground italic">Anonymous</span>
        ) : (
          <span className="font-medium">{row.original.donor_name}</span>
        ),
    },
    {
      accessorKey: "program_name",
      meta: { label: "Program" },
      header: ({ column }) => <SortableHeader column={column} title="Program" />,
    },
    {
      id: "kind",
      accessorFn: (r) => (r.kind === "cash" ? "Money" : "In kind"),
      meta: { label: "Kind" },
      header: ({ column }) => <SortableHeader column={column} title="Kind" />,
      cell: ({ row }) =>
        row.original.kind === "in_kind" ? (
          <div className="min-w-0">
            <Badge variant="outline" className="gap-1.5">
              <Package className="size-3" />
              In kind
            </Badge>
            {row.original.item_description && (
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {row.original.item_description}
              </p>
            )}
          </div>
        ) : (
          <span className="text-sm">
            {METHOD_LABELS[row.original.method ?? ""] ?? "Money"}
          </span>
        ),
      filterFn: "equalsString",
    },
    {
      accessorKey: "amount",
      meta: { label: "Amount" },
      header: ({ column }) => (
        <SortableHeader column={column} title="Amount" align="right" />
      ),
      cell: ({ row }) => (
        <div className="text-right">
          <MoneyDisplay
            amount={row.original.amount}
            muted={row.original.status === "voided"}
            emphasis={row.original.status !== "voided"}
            className={cn(row.original.status === "voided" && "line-through")}
          />
          {/* In-kind is a valuation, not money taken in. Saying so on the row
              stops a treasurer reading the column as a cash total. */}
          {row.original.kind === "in_kind" && (
            <p className="text-xs text-muted-foreground">estimated value</p>
          )}
        </div>
      ),
    },
    {
      accessorKey: "received_by_name",
      meta: { label: "Received by" },
      header: ({ column }) => (
        <SortableHeader column={column} title="Received by" />
      ),
    },
    {
      id: "status",
      accessorFn: (r) => (r.status === "voided" ? "Voided" : "Posted"),
      meta: { label: "Status" },
      header: ({ column }) => <SortableHeader column={column} title="Status" />,
      cell: ({ row }) => (
        <Badge
          variant="outline"
          className={cn(
            "gap-1.5 font-medium",
            row.original.status === "voided"
              ? "border-destructive/25 bg-destructive/10 text-destructive"
              : "border-success/25 bg-success/10 text-success",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              row.original.status === "voided" ? "bg-destructive" : "bg-success",
            )}
          />
          {row.original.status === "voided" ? "Voided" : "Posted"}
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
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/donations/${row.original.id}`}>View</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link
              href={`/print/donation/${row.original.id}`}
              aria-label={`Print ${row.original.acknowledgement_number}`}
            >
              <Printer className="size-3.5" />
            </Link>
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      pageSize={pageSize}
      leading={filters}
      searchPlaceholder={searchable ? "Search donations…" : undefined}
      facets={[
        {
          columnId: "kind",
          title: "Kinds",
          options: [
            { value: "Money", label: "Money" },
            { value: "In kind", label: "In kind" },
          ],
        },
        {
          columnId: "status",
          title: "Statuses",
          options: [
            { value: "Posted", label: "Posted" },
            { value: "Voided", label: "Voided" },
          ],
        },
      ]}
    />
  );
}
