"use client";

import { CircleCheck, Printer, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { portalButton, portalCard } from "@/components/portal/styles";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/financial/money";
import type { CollectResult } from "./household-payment";

/** The money is in. Hand back the change and the receipt, then the next parent. */
export function PaymentResult({
  result,
  onNext,
}: {
  result: CollectResult;
  onNext: () => void;
}) {
  return (
    <section
      aria-labelledby="payment-recorded"
      aria-live="polite"
      className={cn(portalCard, "portal-in mx-auto max-w-lg p-6 sm:p-8")}
    >
      <div className="text-center">
        <span className="mx-auto grid size-18 place-items-center rounded-full bg-emerald-500 text-white shadow-xl shadow-emerald-700/25">
          <CircleCheck className="size-10" aria-hidden />
        </span>
        <h1 id="payment-recorded" className="mt-4 text-sm text-slate-500">
          Payment recorded for {result.payerName}
        </h1>
        <p className="mt-1 text-5xl font-semibold tracking-tight text-slate-900 tabular-nums">
          {formatMoney(result.total)}
        </p>
      </div>

      {result.change !== null && (
        <div className="mt-6 flex items-baseline justify-between gap-3 rounded-2xl bg-emerald-50 px-5 py-4 text-emerald-900 ring-1 ring-emerald-200">
          <span className="font-medium">Give change</span>
          <span className="text-3xl font-semibold tabular-nums">
            {formatMoney(result.change)}
          </span>
        </div>
      )}

      <ul className="mt-5 divide-y divide-slate-100 rounded-2xl bg-slate-50 px-4 ring-1 ring-slate-900/5">
        {result.receipts.map((receipt) => (
          <li key={receipt.paymentId} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{receipt.studentName}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {receipt.receiptNumber} &middot; {formatMoney(receipt.total)}
              </p>
            </div>
            <Button asChild variant="outline" className="min-h-11 rounded-full border-slate-200 bg-white">
              <a
                href={`/print/receipt/${receipt.paymentId}`}
                target="_blank"
                rel="noreferrer"
                aria-label={`Print receipt ${receipt.receiptNumber}`}
              >
                <Printer className="size-4" aria-hidden />
                Print
              </a>
            </Button>
          </li>
        ))}
      </ul>

      <p className="mt-4 flex items-baseline justify-between px-1 text-sm text-slate-500">
        <span>Balance still owing</span>
        <span className="font-medium text-foreground tabular-nums">
          {formatMoney(result.remaining)}
        </span>
      </p>

      <button type="button" className={cn(portalButton, "mt-6")} onClick={onNext}>
        <ScanLine className="size-5" aria-hidden />
        Next parent
      </button>
    </section>
  );
}
