"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable, SortableHeader } from "@/components/common/data-table";
import { MoneyDisplay } from "@/components/common/money-display";
import { PaymentStatusBadge } from "@/components/common/status-badge";
import { cn } from "@/lib/utils";
import type { PaymentStatus } from "@/types/database.types";

export interface PaymentRow {
  id: string;
  receipt_number: string;
  /** Pre-formatted in the school's timezone — day boundaries are the SQL's
   *  business, never the browser's. */
  when: string;
  student_name: string;
  total_amount: number;
  payment_method: string;
  cashier_name: string;
  status: PaymentStatus;
}

function buildColumns(dateLabel: string): ColumnDef<PaymentRow>[] {
  return [
    {
      accessorKey: "receipt_number",
      meta: { label: "Receipt" },
      header: ({ column }) => <SortableHeader column={column} title="Receipt" />,
      cell: ({ row }) => (
        <Link
          href={`/collections/${row.original.id}`}
          className={cn(
            "font-mono text-sm font-medium underline-offset-4 hover:text-primary hover:underline",
            row.original.status === "voided" && "line-through opacity-70",
          )}
        >
          {row.original.receipt_number}
        </Link>
      ),
    },
    {
      accessorKey: "when",
      meta: { label: dateLabel },
      header: ({ column }) => (
        <SortableHeader column={column} title={dateLabel} />
      ),
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {row.original.when}
        </span>
      ),
    },
    {
      accessorKey: "student_name",
      meta: { label: "Student" },
      header: ({ column }) => <SortableHeader column={column} title="Student" />,
    },
    {
      accessorKey: "total_amount",
      meta: { label: "Amount" },
      header: ({ column }) => (
        <SortableHeader column={column} title="Amount" align="right" />
      ),
      cell: ({ row }) => (
        <div className="text-right">
          <MoneyDisplay
            amount={row.original.total_amount}
            emphasis
            className={cn(row.original.status === "voided" && "line-through")}
          />
        </div>
      ),
    },
    {
      accessorKey: "payment_method",
      meta: { label: "Method" },
      header: ({ column }) => <SortableHeader column={column} title="Method" />,
      cell: ({ row }) => (
        <span className="capitalize">
          {row.original.payment_method.replace("_", " ")}
        </span>
      ),
      filterFn: "equalsString",
    },
    {
      accessorKey: "cashier_name",
      meta: { label: "Cashier" },
      header: ({ column }) => <SortableHeader column={column} title="Cashier" />,
      filterFn: "equalsString",
    },
    {
      accessorKey: "status",
      meta: { label: "Status" },
      header: ({ column }) => <SortableHeader column={column} title="Status" />,
      cell: ({ row }) => <PaymentStatusBadge status={row.original.status} />,
      filterFn: "equalsString",
    },
  ];
}

export function PaymentsTable({
  rows,
  dateLabel = "Date",
  searchable = true,
  pageSize = 25,
  filters,
}: {
  rows: PaymentRow[];
  dateLabel?: string;
  /** Off when the page already runs a server-side search over ALL receipts. */
  searchable?: boolean;
  pageSize?: number;
  /** Server-side filters, rendered at the head of the table's own toolbar. */
  filters?: React.ReactNode;
}) {
  const columns = buildColumns(dateLabel);

  const methods = Array.from(new Set(rows.map((r) => r.payment_method)));
  const cashiers = Array.from(new Set(rows.map((r) => r.cashier_name))).filter(
    (c) => c && c !== "—",
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      pageSize={pageSize}
      leading={filters}
      searchPlaceholder={searchable ? "Search receipts…" : undefined}
      facets={[
        {
          columnId: "payment_method",
          title: "Methods",
          options: methods.map((m) => ({
            value: m,
            label: m.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase()),
          })),
        },
        ...(cashiers.length > 1
          ? [
              {
                columnId: "cashier_name",
                title: "Cashiers",
                options: cashiers.map((c) => ({ value: c, label: c })),
              },
            ]
          : []),
      ]}
    />
  );
}
