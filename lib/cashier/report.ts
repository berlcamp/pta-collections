import { sumMoney } from "@/lib/financial/money";

export const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  gcash: "GCash",
  bank_transfer: "Bank transfer",
  other: "Other",
};

const METHOD_ORDER = ["cash", "gcash", "bank_transfer", "other"];

export interface SummarizableReceipt {
  total_amount: number;
  payment_method: string;
  status: string;
}

export interface CollectionSummary {
  total: number;
  receipts: number;
  /** Physical cash the cashier should be holding. Only this half is a drawer. */
  cash: number;
  voided: number;
  byMethod: { method: string; label: string; total: number; receipts: number }[];
}

/** Voided receipts stay on the report so the series reads whole; they count for nothing. */
export function summarizeCollections(rows: SummarizableReceipt[]): CollectionSummary {
  const posted = rows.filter((r) => r.status === "posted");

  const byMethod = METHOD_ORDER.flatMap((method) => {
    const group = posted.filter((r) => r.payment_method === method);
    return group.length === 0
      ? []
      : [
          {
            method,
            label: METHOD_LABELS[method],
            total: sumMoney(group.map((r) => r.total_amount)),
            receipts: group.length,
          },
        ];
  });

  return {
    total: sumMoney(posted.map((r) => r.total_amount)),
    receipts: posted.length,
    cash: byMethod.find((m) => m.method === "cash")?.total ?? 0,
    voided: rows.length - posted.length,
    byMethod,
  };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Read a report period from the URL. Anything malformed falls back to today, and
 * a backwards range is put the right way round rather than showing an empty report.
 */
export function resolvePeriod(
  from: string | undefined,
  to: string | undefined,
  today: string,
): { from: string; to: string } {
  const start = from && DAY.test(from) ? from : today;
  const end = to && DAY.test(to) ? to : start;
  return start <= end ? { from: start, to: end } : { from: end, to: start };
}

/** The calendar day before a YYYY-MM-DD. No clock or timezone is involved. */
export function previousDay(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
