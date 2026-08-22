"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable, SortableHeader } from "@/components/common/data-table";
import { MoneyDisplay } from "@/components/common/money-display";
import { TableCell, TableRow } from "@/components/ui/table";

/* -------------------------------------------------------------------------- */
/*  Collection report — one row per receipt                                   */
/* -------------------------------------------------------------------------- */

export interface CollectionReportRow {
  id: string;
  date: string;
  receipt_number: string;
  student_name: string;
  fee_names: string;
  total_amount: number;
  payment_method: string;
  cashier_name: string;
}

const collectionColumns: ColumnDef<CollectionReportRow>[] = [
  {
    accessorKey: "date",
    meta: { label: "Date" },
    header: ({ column }) => <SortableHeader column={column} title="Date" />,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {row.original.date}
      </span>
    ),
  },
  {
    accessorKey: "receipt_number",
    meta: { label: "Receipt" },
    header: ({ column }) => <SortableHeader column={column} title="Receipt" />,
    cell: ({ row }) => (
      <Link
        href={`/collections/${row.original.id}`}
        className="font-mono text-sm underline-offset-4 hover:text-primary hover:underline"
      >
        {row.original.receipt_number}
      </Link>
    ),
  },
  {
    accessorKey: "student_name",
    meta: { label: "Student" },
    header: ({ column }) => <SortableHeader column={column} title="Student" />,
  },
  {
    accessorKey: "fee_names",
    meta: { label: "Fees" },
    header: "Fees",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="line-clamp-1 max-w-xs text-muted-foreground">
        {row.original.fee_names || "—"}
      </span>
    ),
  },
  {
    accessorKey: "total_amount",
    meta: { label: "Amount" },
    header: ({ column }) => (
      <SortableHeader column={column} title="Amount" align="right" />
    ),
    cell: ({ row }) => (
      <div className="text-right">
        <MoneyDisplay amount={row.original.total_amount} />
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
];

export function CollectionReportTable({
  rows,
}: {
  rows: CollectionReportRow[];
}) {
  const methods = Array.from(new Set(rows.map((r) => r.payment_method)));
  const cashiers = Array.from(new Set(rows.map((r) => r.cashier_name)));

  return (
    <DataTable
      columns={collectionColumns}
      data={rows}
      pageSize={50}
      searchPlaceholder="Search receipt or student…"
      facets={[
        {
          columnId: "payment_method",
          title: "Methods",
          options: methods.map((m) => ({
            value: m,
            label: m.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase()),
          })),
        },
        {
          columnId: "cashier_name",
          title: "Cashiers",
          options: cashiers.map((c) => ({ value: c, label: c })),
        },
      ]}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Fee type report                                                           */
/* -------------------------------------------------------------------------- */

export interface FeeTypeReportRow {
  fee_type_id: string;
  fee_type_name: string;
  fee_category: string;
  receipt_count: number;
  total: number;
  share: string;
}

const feeTypeColumns: ColumnDef<FeeTypeReportRow>[] = [
  {
    accessorKey: "fee_type_name",
    meta: { label: "Fee type" },
    header: ({ column }) => <SortableHeader column={column} title="Fee type" />,
    cell: ({ row }) => (
      <span className="font-medium">{row.original.fee_type_name}</span>
    ),
  },
  {
    accessorKey: "fee_category",
    meta: { label: "Category" },
    header: ({ column }) => <SortableHeader column={column} title="Category" />,
    cell: ({ row }) => (
      <span className="capitalize text-muted-foreground">
        {row.original.fee_category}
      </span>
    ),
    filterFn: "equalsString",
  },
  {
    accessorKey: "receipt_count",
    meta: { label: "Receipts" },
    header: ({ column }) => (
      <SortableHeader column={column} title="Receipts" align="right" />
    ),
    cell: ({ row }) => (
      <div className="text-right font-mono tabular-nums">
        {row.original.receipt_count.toLocaleString()}
      </div>
    ),
  },
  {
    accessorKey: "total",
    meta: { label: "Collected" },
    header: ({ column }) => (
      <SortableHeader column={column} title="Collected" align="right" />
    ),
    cell: ({ row }) => (
      <div className="text-right">
        <MoneyDisplay amount={row.original.total} />
      </div>
    ),
  },
  {
    accessorKey: "share",
    meta: { label: "Share" },
    header: "Share",
    enableSorting: false,
    cell: ({ row }) => (
      <div className="text-right font-mono tabular-nums text-muted-foreground">
        {row.original.share}
      </div>
    ),
  },
];

export function FeeTypeReportTable({
  rows,
  total,
}: {
  rows: FeeTypeReportRow[];
  total: number;
}) {
  return (
    <DataTable
      columns={feeTypeColumns}
      data={rows}
      pageSize={0}
      initialSorting={[{ id: "total", desc: true }]}
      hideViewOptions
      footer={
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={3} className="px-3 font-semibold">
            Total
          </TableCell>
          <TableCell className="px-3 text-right">
            <MoneyDisplay amount={total} emphasis />
          </TableCell>
          <TableCell />
        </TableRow>
      }
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Cashier report                                                            */
/* -------------------------------------------------------------------------- */

export interface CashierReportRow {
  collected_by: string;
  cashier_name: string;
  cash_total: number;
  gcash_total: number;
  bank_total: number;
  other_total: number;
  receipt_count: number;
  total: number;
}

function money(id: keyof CashierReportRow, title: string): ColumnDef<CashierReportRow> {
  return {
    accessorKey: id,
    meta: { label: title },
    header: ({ column }) => (
      <SortableHeader column={column} title={title} align="right" />
    ),
    cell: ({ row }) => (
      <div className="text-right">
        <MoneyDisplay amount={row.original[id] as number} />
      </div>
    ),
  };
}

const cashierColumns: ColumnDef<CashierReportRow>[] = [
  {
    accessorKey: "cashier_name",
    meta: { label: "Cashier" },
    header: ({ column }) => <SortableHeader column={column} title="Cashier" />,
    cell: ({ row }) => (
      <span className="font-medium">{row.original.cashier_name}</span>
    ),
  },
  money("cash_total", "Cash"),
  money("gcash_total", "GCash"),
  money("bank_total", "Bank"),
  money("other_total", "Other"),
  {
    accessorKey: "receipt_count",
    meta: { label: "Receipts" },
    header: ({ column }) => (
      <SortableHeader column={column} title="Receipts" align="right" />
    ),
    cell: ({ row }) => (
      <div className="text-right font-mono tabular-nums">
        {row.original.receipt_count.toLocaleString()}
      </div>
    ),
  },
  {
    accessorKey: "total",
    meta: { label: "Total" },
    header: ({ column }) => (
      <SortableHeader column={column} title="Total" align="right" />
    ),
    cell: ({ row }) => (
      <div className="text-right">
        <MoneyDisplay amount={row.original.total} emphasis />
      </div>
    ),
  },
];

export function CashierReportTable({
  rows,
  totals,
}: {
  rows: CashierReportRow[];
  totals: {
    cash: number;
    gcash: number;
    bank: number;
    other: number;
    receipts: number;
    total: number;
  };
}) {
  return (
    <DataTable
      columns={cashierColumns}
      data={rows}
      pageSize={0}
      initialSorting={[{ id: "total", desc: true }]}
      hideViewOptions
      footer={
        <TableRow className="hover:bg-transparent">
          <TableCell className="px-3 font-semibold">All cashiers</TableCell>
          <TableCell className="px-3 text-right">
            <MoneyDisplay amount={totals.cash} />
          </TableCell>
          <TableCell className="px-3 text-right">
            <MoneyDisplay amount={totals.gcash} />
          </TableCell>
          <TableCell className="px-3 text-right">
            <MoneyDisplay amount={totals.bank} />
          </TableCell>
          <TableCell className="px-3 text-right">
            <MoneyDisplay amount={totals.other} />
          </TableCell>
          <TableCell className="px-3 text-right font-mono tabular-nums">
            {totals.receipts.toLocaleString()}
          </TableCell>
          <TableCell className="px-3 text-right">
            <MoneyDisplay amount={totals.total} emphasis />
          </TableCell>
        </TableRow>
      }
    />
  );
}
