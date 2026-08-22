"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { DataTable, SortableHeader } from "@/components/common/data-table";
import { MoneyDisplay } from "@/components/common/money-display";
import { ChargeStatusBadge } from "@/components/common/status-badge";
import { WaiveChargeDialog } from "@/components/charges/waive-charge-dialog";
import { TableCell, TableRow } from "@/components/ui/table";
import type { DerivedPaymentStatus } from "@/types/database.types";

export interface StudentChargeRow {
  id: string;
  fee_type_name: string;
  description: string | null;
  status_reason: string | null;
  due: string;
  amount: number;
  waived_amount: number;
  paid: number;
  balance: number;
  status: string;
  payment_status: DerivedPaymentStatus;
}

export function StudentChargesTable({
  rows,
  canWaive,
}: {
  rows: StudentChargeRow[];
  canWaive: boolean;
}) {
  const columns: ColumnDef<StudentChargeRow>[] = [
    {
      accessorKey: "fee_type_name",
      meta: { label: "Fee" },
      header: ({ column }) => <SortableHeader column={column} title="Fee" />,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="font-medium">{row.original.fee_type_name}</p>
          {row.original.description &&
            row.original.description !== row.original.fee_type_name && (
              <p className="text-xs text-muted-foreground">
                {row.original.description}
              </p>
            )}
          {row.original.status_reason && (
            <p className="text-xs text-muted-foreground italic">
              {row.original.status_reason}
            </p>
          )}
        </div>
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
      accessorKey: "waived_amount",
      meta: { label: "Waived" },
      header: ({ column }) => (
        <SortableHeader column={column} title="Waived" align="right" />
      ),
      cell: ({ row }) => (
        <div className="text-right">
          <MoneyDisplay amount={row.original.waived_amount} muted />
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
          <MoneyDisplay amount={row.original.paid} />
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
      cell: ({ row }) => (
        <ChargeStatusBadge status={row.original.payment_status} />
      ),
      filterFn: "equalsString",
    },
    ...(canWaive
      ? [
          {
            id: "actions",
            header: "",
            enableHiding: false,
            enableSorting: false,
            cell: ({ row }) =>
              row.original.status === "active" &&
              Number(row.original.balance) > 0 ? (
                <div className="text-right">
                  <WaiveChargeDialog
                    chargeId={row.original.id}
                    feeName={row.original.fee_type_name}
                    amount={Number(row.original.amount)}
                    paid={Number(row.original.paid)}
                    waived={Number(row.original.waived_amount)}
                  />
                </div>
              ) : null,
          } satisfies ColumnDef<StudentChargeRow>,
        ]
      : []),
  ];

  const totals = rows.reduce(
    (acc, r) => ({
      amount: acc.amount + Number(r.amount),
      waived: acc.waived + Number(r.waived_amount),
      paid: acc.paid + Number(r.paid),
      balance: acc.balance + Number(r.balance),
    }),
    { amount: 0, waived: 0, paid: 0, balance: 0 },
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      pageSize={0}
      hideViewOptions
      footer={
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={2} className="px-3 font-semibold">
            Total
          </TableCell>
          <TableCell className="px-3 text-right">
            <MoneyDisplay amount={totals.amount} />
          </TableCell>
          <TableCell className="px-3 text-right">
            <MoneyDisplay amount={totals.waived} muted />
          </TableCell>
          <TableCell className="px-3 text-right">
            <MoneyDisplay amount={totals.paid} />
          </TableCell>
          <TableCell className="px-3 text-right">
            <MoneyDisplay amount={totals.balance} emphasis />
          </TableCell>
          <TableCell />
          {canWaive && <TableCell />}
        </TableRow>
      }
    />
  );
}
