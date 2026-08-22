import type { ChargeBalance } from "@/types/database.types";
import { clampMoney, sumMoney, toCentavos } from "./money";

/**
 * Payment allocation (D13).
 *
 * The cashier allocates per line. Selecting a charge pre-fills its full
 * remaining balance, oldest due date first; each line can be edited DOWN but
 * never up. The payment total is the sum of the lines — never a free-typed
 * number — which removes the "total doesn't match items" class of bug entirely.
 *
 * These are pure helpers for the UI. The database re-validates every line
 * against a freshly computed balance and rejects overpayment regardless of
 * what the client sends.
 */

export interface AllocationLine {
  chargeId: string;
  feeTypeName: string;
  description: string | null;
  dueDate: string | null;
  balance: number;
  amount: number;
  selected: boolean;
}

/** Oldest due date first; charges with no due date sort last, then by creation. */
export function sortChargesForAllocation(
  charges: ChargeBalance[],
): ChargeBalance[] {
  return [...charges].sort((a, b) => {
    if (a.due_date && b.due_date) {
      const d = a.due_date.localeCompare(b.due_date);
      if (d !== 0) return d;
    } else if (a.due_date && !b.due_date) {
      return -1;
    } else if (!a.due_date && b.due_date) {
      return 1;
    }
    return a.created_at.localeCompare(b.created_at);
  });
}

/** Build the initial (unselected) line set from a student's outstanding charges. */
export function buildAllocationLines(
  charges: ChargeBalance[],
): AllocationLine[] {
  return sortChargesForAllocation(
    charges.filter((c) => c.status === "active" && c.balance > 0),
  ).map((c) => ({
    chargeId: c.id,
    feeTypeName: c.fee_type_name,
    description: c.description,
    dueDate: c.due_date,
    balance: c.balance,
    amount: c.balance,
    selected: false,
  }));
}

/** Total of the selected lines. This IS the payment total. */
export function allocationTotal(lines: AllocationLine[]): number {
  return sumMoney(lines.filter((l) => l.selected).map((l) => l.amount));
}

/** A line amount may never exceed its own remaining balance. */
export function setLineAmount(
  lines: AllocationLine[],
  chargeId: string,
  amount: number,
): AllocationLine[] {
  return lines.map((l) =>
    l.chargeId === chargeId ? { ...l, amount: clampMoney(amount, l.balance) } : l,
  );
}

/** Toggling a line on resets it to the full remaining balance. */
export function toggleLine(
  lines: AllocationLine[],
  chargeId: string,
  selected: boolean,
): AllocationLine[] {
  return lines.map((l) =>
    l.chargeId === chargeId
      ? { ...l, selected, amount: selected ? l.balance : l.amount }
      : l,
  );
}

export function selectAll(lines: AllocationLine[]): AllocationLine[] {
  return lines.map((l) => ({ ...l, selected: true, amount: l.balance }));
}

export function clearAll(lines: AllocationLine[]): AllocationLine[] {
  return lines.map((l) => ({ ...l, selected: false }));
}

export interface AllocationValidation {
  valid: boolean;
  errors: string[];
  total: number;
}

export function validateAllocation(
  lines: AllocationLine[],
): AllocationValidation {
  const errors: string[] = [];
  const selected = lines.filter((l) => l.selected);

  if (selected.length === 0) {
    errors.push("Select at least one charge to pay.");
  }
  for (const line of selected) {
    if (toCentavos(line.amount) <= 0) {
      errors.push(`${line.feeTypeName}: amount must be greater than zero.`);
    }
    if (toCentavos(line.amount) > toCentavos(line.balance)) {
      // Unreachable through the UI (setLineAmount clamps), but a mismatch here
      // means the UI and the database disagree, which is a bug worth surfacing.
      errors.push(
        `${line.feeTypeName}: amount exceeds the remaining balance.`,
      );
    }
  }

  return { valid: errors.length === 0, errors, total: allocationTotal(lines) };
}

/** The payload shape pta.create_payment expects. */
export function toRpcItems(
  lines: AllocationLine[],
): { charge_id: string; amount: number }[] {
  return lines
    .filter((l) => l.selected)
    .map((l) => ({ charge_id: l.chargeId, amount: l.amount }));
}
