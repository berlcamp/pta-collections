import { describe, expect, it } from "vitest";
import {
  allocationTotal,
  buildAllocationLines,
  clearAll,
  selectAll,
  setLineAmount,
  sortChargesForAllocation,
  toRpcItems,
  toggleLine,
  validateAllocation,
} from "@/lib/financial/allocation";
import type { ChargeBalance } from "@/types/database.types";

function charge(over: Partial<ChargeBalance>): ChargeBalance {
  return {
    id: "c1",
    school_id: "s1",
    student_id: "st1",
    school_year_id: "y1",
    fee_type_id: "f1",
    fee_type_name: "PTA Annual Membership",
    fee_category: "annual",
    description: null,
    amount: 100,
    waived_amount: 0,
    due_date: null,
    status: "active",
    status_reason: null,
    created_at: "2026-06-01T00:00:00Z",
    paid: 0,
    balance: 100,
    payment_status: "unpaid",
    ...over,
  };
}

describe("allocation ordering", () => {
  it("puts the oldest due date first", () => {
    const sorted = sortChargesForAllocation([
      charge({ id: "b", due_date: "2026-09-30" }),
      charge({ id: "a", due_date: "2026-07-31" }),
      charge({ id: "c", due_date: "2026-12-31" }),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("sorts charges with no due date last", () => {
    const sorted = sortChargesForAllocation([
      charge({ id: "none", due_date: null }),
      charge({ id: "dated", due_date: "2026-07-31" }),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(["dated", "none"]);
  });

  it("falls back to creation order when neither has a due date", () => {
    const sorted = sortChargesForAllocation([
      charge({ id: "second", due_date: null, created_at: "2026-08-01T00:00:00Z" }),
      charge({ id: "first", due_date: null, created_at: "2026-06-01T00:00:00Z" }),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(["first", "second"]);
  });
});

describe("building lines", () => {
  it("excludes settled, waived and cancelled charges", () => {
    const lines = buildAllocationLines([
      charge({ id: "open", balance: 100 }),
      charge({ id: "settled", balance: 0, payment_status: "paid" }),
      charge({ id: "waived", status: "waived", balance: 0 }),
      charge({ id: "cancelled", status: "cancelled", balance: 100 }),
    ]);
    expect(lines.map((l) => l.chargeId)).toEqual(["open"]);
  });

  it("pre-fills each line with its full remaining balance but leaves it unselected", () => {
    const [line] = buildAllocationLines([charge({ amount: 100, paid: 40, balance: 60 })]);
    expect(line.amount).toBe(60);
    expect(line.selected).toBe(false);
  });
});

describe("line editing", () => {
  const lines = buildAllocationLines([
    charge({ id: "a", balance: 100, due_date: "2026-07-01" }),
    charge({ id: "b", balance: 50, due_date: "2026-08-01" }),
  ]);

  it("counts only selected lines in the total", () => {
    expect(allocationTotal(lines)).toBe(0);
    const withA = toggleLine(lines, "a", true);
    expect(allocationTotal(withA)).toBe(100);
    expect(allocationTotal(selectAll(lines))).toBe(150);
    expect(allocationTotal(clearAll(selectAll(lines)))).toBe(0);
  });

  it("clamps a line to its own balance — overpayment is impossible in the UI", () => {
    const edited = setLineAmount(selectAll(lines), "b", 999);
    expect(edited.find((l) => l.chargeId === "b")!.amount).toBe(50);
  });

  it("allows editing a line down for a partial payment", () => {
    const edited = setLineAmount(selectAll(lines), "a", 30);
    expect(allocationTotal(edited)).toBe(80);
  });

  it("resets a line to its full balance when re-selected", () => {
    let l = selectAll(lines);
    l = setLineAmount(l, "a", 10);
    l = toggleLine(l, "a", false);
    l = toggleLine(l, "a", true);
    expect(l.find((x) => x.chargeId === "a")!.amount).toBe(100);
  });
});

describe("validation", () => {
  const lines = buildAllocationLines([charge({ id: "a", balance: 100 })]);

  it("rejects an empty allocation", () => {
    const v = validateAllocation(lines);
    expect(v.valid).toBe(false);
    expect(v.errors[0]).toMatch(/at least one charge/i);
  });

  it("rejects a zero-amount line", () => {
    const v = validateAllocation(setLineAmount(selectAll(lines), "a", 0));
    expect(v.valid).toBe(false);
  });

  it("accepts a valid partial allocation", () => {
    const v = validateAllocation(setLineAmount(selectAll(lines), "a", 25));
    expect(v.valid).toBe(true);
    expect(v.total).toBe(25);
  });
});

describe("RPC payload", () => {
  it("sends only the selected lines", () => {
    const lines = buildAllocationLines([
      charge({ id: "a", balance: 100 }),
      charge({ id: "b", balance: 50 }),
    ]);
    const items = toRpcItems(toggleLine(lines, "a", true));
    expect(items).toEqual([{ charge_id: "a", amount: 100 }]);
  });
});
