"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable, SortableHeader } from "@/components/common/data-table";
import { MoneyDisplay } from "@/components/common/money-display";
import { ChargeStatusBadge } from "@/components/common/status-badge";
import type { DerivedPaymentStatus } from "@/types/database.types";

export interface PenaltyRow {
  id: string;
  student_id: string;
  student_name: string;
  fee_type_name: string;
  description: string;
  recorded: string;
  due: string;
  amount: number;
  balance: number;
  payment_status: DerivedPaymentStatus;
}

const columns: ColumnDef<PenaltyRow>[] = [
  {
    accessorKey: "student_name",
    meta: { label: "Student" },
    header: ({ column }) => <SortableHeader column={column} title="Student" />,
    cell: ({ row }) => (
      <Link
        href={`/students/${row.original.student_id}`}
        className="font-medium underline-offset-4 hover:text-primary hover:underline"
      >
        {row.original.student_name}
      </Link>
    ),
  },
  {
    accessorKey: "fee_type_name",
    meta: { label: "Penalty" },
    header: ({ column }) => <SortableHeader column={column} title="Penalty" />,
    filterFn: "equalsString",
  },
  {
    accessorKey: "description",
    meta: { label: "Reason" },
    header: "Reason",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="line-clamp-2 max-w-xs whitespace-normal text-muted-foreground">
        {row.original.description}
      </span>
    ),
  },
  {
    accessorKey: "recorded",
    meta: { label: "Recorded" },
    header: ({ column }) => <SortableHeader column={column} title="Recorded" />,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {row.original.recorded}
      </span>
    ),
  },
  {
    accessorKey: "due",
    meta: { label: "Due" },
    header: ({ column }) => <SortableHeader column={column} title="Due" />,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {row.original.due}
      </span>
    ),
  },
  {
    accessorKey: "amount",
    meta: { label: "Amount" },
    header: ({ column }) => (
      <SortableHeader column={column} title="Amount" align="right" />
    ),
    cell: ({ row }) => (
      <div className="text-right">
        <MoneyDisplay amount={row.original.amount} />
      </div>
    ),
  },
  {
    accessorKey: "balance",
    meta: { label: "Balance" },
    header: ({ column }) => (
      <SortableHeader column={column} title="Balance" align="right" />
    ),
    cell: ({ row }) => (
      <div className="text-right">
        <MoneyDisplay
          amount={row.original.balance}
          emphasis={Number(row.original.balance) > 0}
          muted={Number(row.original.balance) === 0}
        />
      </div>
    ),
  },
  {
    accessorKey: "payment_status",
    meta: { label: "Status" },
    header: ({ column }) => <SortableHeader column={column} title="Status" />,
    cell: ({ row }) => <ChargeStatusBadge status={row.original.payment_status} />,
    filterFn: "equalsString",
  },
];

export function PenaltiesTable({ rows }: { rows: PenaltyRow[] }) {
  const types = Array.from(new Set(rows.map((r) => r.fee_type_name))).sort();

  return (
    <DataTable
      columns={columns}
      data={rows}
      pageSize={25}
      searchPlaceholder="Search student or reason…"
      facets={[
        {
          columnId: "fee_type_name",
          title: "Types",
          options: types.map((t) => ({ value: t, label: t })),
        },
        {
          columnId: "payment_status",
          title: "Statuses",
          options: [
            { value: "unpaid", label: "Unpaid" },
            { value: "partially_paid", label: "Partial" },
            { value: "paid", label: "Paid" },
            { value: "waived", label: "Waived" },
            { value: "cancelled", label: "Cancelled" },
          ],
        },
      ]}
    />
  );
}
