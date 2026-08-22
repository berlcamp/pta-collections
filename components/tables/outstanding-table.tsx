"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable, SortableHeader } from "@/components/common/data-table";
import { MoneyDisplay } from "@/components/common/money-display";
import { ChargeStatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";

export interface OutstandingRow {
  charge_id: string;
  student_id: string;
  student_name: string;
  student_status: string;
  grade_level: string;
  section_name: string | null;
  guardian_name: string | null;
  guardian_contact: string | null;
  fee_type_name: string;
  due: string;
  amount: number;
  paid: number;
  balance: number;
  payment_status: "unpaid" | "partially_paid";
}

const columns: ColumnDef<OutstandingRow>[] = [
  {
    accessorKey: "student_name",
    meta: { label: "Student" },
    header: ({ column }) => <SortableHeader column={column} title="Student" />,
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <Link
          href={`/students/${row.original.student_id}`}
          className="font-medium underline-offset-4 hover:text-primary hover:underline"
        >
          {row.original.student_name}
        </Link>
        {row.original.student_status !== "active" && (
          <Badge variant="outline" className="text-[0.7rem] capitalize">
            {row.original.student_status.replace("_", " ")}
          </Badge>
        )}
      </div>
    ),
  },
  {
    accessorKey: "grade_level",
    meta: { label: "Grade" },
    header: ({ column }) => <SortableHeader column={column} title="Grade" />,
    filterFn: "equalsString",
  },
  {
    accessorKey: "section_name",
    meta: { label: "Section" },
    header: ({ column }) => <SortableHeader column={column} title="Section" />,
    cell: ({ row }) => row.original.section_name ?? "—",
  },
  {
    accessorKey: "guardian_name",
    meta: { label: "Guardian" },
    header: "Guardian",
    enableSorting: false,
    cell: ({ row }) => (
      <div className="min-w-0">
        <span className="block truncate">{row.original.guardian_name ?? "—"}</span>
        {row.original.guardian_contact && (
          <span className="block font-mono text-xs text-muted-foreground">
            {row.original.guardian_contact}
          </span>
        )}
      </div>
    ),
  },
  {
    accessorKey: "fee_type_name",
    meta: { label: "Fee" },
    header: ({ column }) => <SortableHeader column={column} title="Fee" />,
    filterFn: "equalsString",
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
    accessorKey: "paid",
    meta: { label: "Paid" },
    header: ({ column }) => (
      <SortableHeader column={column} title="Paid" align="right" />
    ),
    cell: ({ row }) => (
      <div className="text-right">
        <MoneyDisplay amount={row.original.paid} muted />
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
        <MoneyDisplay amount={row.original.balance} emphasis />
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

export function OutstandingTable({ rows }: { rows: OutstandingRow[] }) {
  const grades = Array.from(new Set(rows.map((r) => r.grade_level))).sort();
  const fees = Array.from(new Set(rows.map((r) => r.fee_type_name))).sort();

  return (
    <DataTable
      columns={columns}
      data={rows}
      pageSize={25}
      initialSorting={[{ id: "balance", desc: true }]}
      searchPlaceholder="Search student or guardian…"
      facets={[
        {
          columnId: "grade_level",
          title: "Grades",
          options: grades.map((g) => ({ value: g, label: g })),
        },
        {
          columnId: "fee_type_name",
          title: "Fees",
          options: fees.map((f) => ({ value: f, label: f })),
        },
      ]}
    />
  );
}
