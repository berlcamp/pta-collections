"use client";

import { CircleCheck, Printer, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
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
      className="mx-auto max-w-lg rounded-xl border bg-card p-6"
    >
      <div className="text-center">
        <CircleCheck className="mx-auto size-10 text-success" aria-hidden />
        <h1 id="payment-recorded" className="mt-3 text-sm text-muted-foreground">
          Payment recorded for {result.payerName}
        </h1>
        <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">
          {formatMoney(result.total)}
        </p>
      </div>

      {result.change !== null && (
        <div className="mt-5 flex items-baseline justify-between gap-3 rounded-lg bg-success/10 px-4 py-3">
          <span className="font-medium">Give change</span>
          <span className="text-3xl font-semibold tabular-nums">
            {formatMoney(result.change)}
          </span>
        </div>
      )}

      <ul className="mt-5 divide-y border-y">
        {result.receipts.map((receipt) => (
          <li key={receipt.paymentId} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{receipt.studentName}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {receipt.receiptNumber} &middot; {formatMoney(receipt.total)}
              </p>
            </div>
            <Button asChild variant="outline" className="min-h-10">
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

      <p className="mt-4 flex items-baseline justify-between text-sm text-muted-foreground">
        <span>Balance still owing</span>
        <span className="font-medium text-foreground tabular-nums">
          {formatMoney(result.remaining)}
        </span>
      </p>

      <Button className="mt-5 h-12 w-full text-base" onClick={onNext}>
        <ScanLine className="size-4" aria-hidden />
        Next parent
      </Button>
    </section>
  );
}
