import type { AllocationLine } from "@/lib/financial/allocation";
import { sumMoney, toCentavos, toPesos } from "@/lib/financial/money";

/**
 * Turning one parent's visit into receipts.
 *
 * A parent pays once, at one counter, for possibly several children and
 * possibly an old year's dues. pta.create_payment records one student in one
 * school year per call, because a receipt is numbered from that year's series
 * and every line must belong to that student and year. So a visit is split here
 * into as many payments as it needs, and nothing financial is decided: the RPC
 * still re-validates every line.
 */
export interface CollectLine extends AllocationLine {
  studentId: string;
  schoolYearId: string;
  schoolYearName: string;
  /** True when the charge is from a year other than the active one. */
  priorYear: boolean;
}

export interface PlannedPayment {
  /** Stable across retries: the idempotency key is looked up by this. */
  key: string;
  studentId: string;
  schoolYearId: string;
  items: { charge_id: string; amount: number }[];
  total: number;
}

export function planPayments(lines: CollectLine[]): PlannedPayment[] {
  const groups = new Map<string, CollectLine[]>();
  for (const line of lines) {
    if (!line.selected) continue;
    const key = `${line.studentId}:${line.schoolYearId}`;
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }

  return [...groups.entries()].map(([key, group]) => ({
    key,
    studentId: group[0].studentId,
    schoolYearId: group[0].schoolYearId,
    items: group.map((l) => ({ charge_id: l.chargeId, amount: l.amount })),
    total: sumMoney(group.map((l) => l.amount)),
  }));
}

/**
 * What to record as tendered on a receipt.
 *
 * Cash handed over for two children is one bill that does not belong to either
 * receipt, and the printed "Tendered / Change" would be false on both. So it is
 * recorded only when one receipt covers the whole visit; the screen still works
 * out the change for the cashier. The column is informational (D13), so leaving
 * it empty moves no money.
 */
export function tenderedForReceipt(
  paymentCount: number,
  tendered: number | null,
): number | null {
  return paymentCount === 1 ? tendered : null;
}

/** One-tap cash amounts: exact, then the next bills a parent would hand over. */
export function quickTenders(total: number): number[] {
  const centavos = toCentavos(total);
  if (centavos <= 0) return [];

  const roundUp = (step: number) =>
    toPesos(Math.ceil(centavos / (step * 100)) * step * 100);

  return [...new Set([total, roundUp(100), roundUp(500), roundUp(1000)])]
    .filter((amount) => amount >= total)
    .sort((a, b) => a - b);
}
