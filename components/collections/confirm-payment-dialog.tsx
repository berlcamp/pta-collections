"use client";

import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatMoney } from "@/lib/financial/money";
import type { AllocationLine } from "@/lib/financial/allocation";

export function ConfirmPaymentDialog({
  open,
  onOpenChange,
  studentName,
  lines,
  total,
  method,
  change,
  submitting,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  studentName: string;
  lines: AllocationLine[];
  total: number;
  method: string;
  change: number | null;
  submitting: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm payment</AlertDialogTitle>
          <AlertDialogDescription>
            A receipt number will be issued. Payments cannot be edited — a
            mistake must be voided and re-entered.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Student</p>
            <p className="font-medium">{studentName}</p>
          </div>

          <div className="rounded-md border">
            {lines.map((l) => (
              <div
                key={l.chargeId}
                className="flex justify-between gap-3 border-b px-3 py-2 last:border-0"
              >
                <span className="min-w-0 truncate">{l.feeTypeName}</span>
                <span className="font-mono tabular-nums">{formatMoney(l.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between gap-3 bg-muted/50 px-3 py-2 font-semibold">
              <span>Total ({method})</span>
              <span className="font-mono tabular-nums">{formatMoney(total)}</span>
            </div>
            {change !== null && (
              <div className="flex justify-between gap-3 px-3 py-2 text-muted-foreground">
                <span>Change</span>
                <span className="font-mono tabular-nums">{formatMoney(change)}</span>
              </div>
            )}
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={submitting}
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Confirm payment
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
