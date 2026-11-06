import { describe, expect, it } from "vitest";
import { createScanBuffer } from "@/lib/cashier/scan-buffer";
import {
  planPayments,
  quickTenders,
  tenderedForReceipt,
  type CollectLine,
} from "@/lib/cashier/settlement";
import {
  previousDay,
  resolvePeriod,
  summarizeCollections,
} from "@/lib/cashier/report";

const VALID_CARD = "4539148803436467";
const BAD_CHECK_DIGIT = "4539148803436468";

/** Type a string at a fixed interval and return every event. */
function type(
  buffer: ReturnType<typeof createScanBuffer>,
  keys: string[],
  gap: number,
  start = 1000,
) {
  return keys.map((key, i) => buffer.feed(key, start + i * gap));
}

describe("scan buffer", () => {
  it("recognises a fast sixteen-digit burst with a valid check digit", () => {
    const events = type(createScanBuffer(), VALID_CARD.split(""), 5);
    expect(events.at(-1)).toEqual({ type: "scan", card: VALID_CARD });
    expect(events.slice(0, -1).every((e) => e.type === "none")).toBe(true);
  });

  it("swallows the Enter that ends a scan so it cannot press a focused button", () => {
    const buffer = createScanBuffer();
    type(buffer, VALID_CARD.split(""), 5);
    expect(buffer.feed("Enter", 1000 + 16 * 5)).toEqual({ type: "swallow" });
    // Only that one. The cashier's own Enter a moment later is theirs.
    expect(buffer.feed("Enter", 1000 + 17 * 5)).toEqual({ type: "none" });
  });

  it("does not treat a person typing an amount as a scan", () => {
    const events = type(createScanBuffer(), VALID_CARD.split(""), 120);
    expect(events.every((e) => e.type === "none")).toBe(true);
  });

  it("leaves the Enter of a typed amount alone", () => {
    const buffer = createScanBuffer();
    type(buffer, ["5", "0", "0"], 120);
    expect(buffer.feed("Enter", 2000)).toEqual({ type: "none" });
  });

  it("reports a burst that fails the check digit as a misread", () => {
    const events = type(createScanBuffer(), BAD_CHECK_DIGIT.split(""), 5);
    expect(events.at(-1)).toEqual({ type: "misread" });
  });

  it("reports a short burst ended by Enter as a misread", () => {
    const buffer = createScanBuffer();
    const at = type(buffer, "123456789012".split(""), 5);
    expect(at.at(-1)).toEqual({ type: "none" });
    expect(buffer.feed("Enter", 1000 + 12 * 5)).toEqual({ type: "misread" });
  });

  it("starts over after a pause, so stray digits cannot prefix a real scan", () => {
    const buffer = createScanBuffer();
    buffer.feed("9", 0);
    const events = type(buffer, VALID_CARD.split(""), 5, 5000);
    expect(events.at(-1)).toEqual({ type: "scan", card: VALID_CARD });
  });

  it("a letter breaks the burst", () => {
    const buffer = createScanBuffer();
    const half = VALID_CARD.slice(0, 8).split("");
    type(buffer, half, 5);
    buffer.feed("a", 1000 + 8 * 5);
    const rest = type(buffer, VALID_CARD.slice(8).split(""), 5, 1000 + 9 * 5);
    expect(rest.every((e) => e.type === "none")).toBe(true);
  });
});

function line(over: Partial<CollectLine>): CollectLine {
  return {
    chargeId: "c1",
    feeTypeName: "PTA Annual Membership",
    description: null,
    dueDate: null,
    balance: 100,
    amount: 100,
    selected: true,
    studentId: "ana",
    schoolYearId: "y2026",
    schoolYearName: "2026-2027",
    priorYear: false,
    ...over,
  };
}

describe("planPayments", () => {
  it("makes one payment when one child pays several charges", () => {
    const plan = planPayments([
      line({ chargeId: "a", amount: 100 }),
      line({ chargeId: "b", amount: 50.5 }),
    ]);
    expect(plan).toHaveLength(1);
    expect(plan[0].total).toBe(150.5);
    expect(plan[0].items).toEqual([
      { charge_id: "a", amount: 100 },
      { charge_id: "b", amount: 50.5 },
    ]);
  });

  it("gives each child their own receipt", () => {
    const plan = planPayments([
      line({ chargeId: "a", studentId: "ana" }),
      line({ chargeId: "b", studentId: "ben" }),
    ]);
    expect(plan.map((p) => p.studentId)).toEqual(["ana", "ben"]);
  });

  it("splits one child's prior-year dues into that year's series", () => {
    const plan = planPayments([
      line({ chargeId: "a", schoolYearId: "y2026" }),
      line({ chargeId: "b", schoolYearId: "y2025", priorYear: true }),
    ]);
    expect(plan.map((p) => p.schoolYearId)).toEqual(["y2026", "y2025"]);
  });

  it("ignores lines that are not selected", () => {
    expect(planPayments([line({ selected: false })])).toEqual([]);
  });

  it("keeps a key stable so a retry reuses its idempotency key", () => {
    const lines = [line({ chargeId: "a" })];
    expect(planPayments(lines)[0].key).toBe(planPayments(lines)[0].key);
  });

  it("does not suffer float drift when totalling", () => {
    const plan = planPayments([
      line({ chargeId: "a", amount: 0.1 }),
      line({ chargeId: "b", amount: 0.2 }),
    ]);
    expect(plan[0].total).toBe(0.3);
  });
});

describe("tenderedForReceipt", () => {
  it("records tendered when one receipt covers the visit", () => {
    expect(tenderedForReceipt(1, 1000)).toBe(1000);
  });

  it("does not print one bill on two receipts", () => {
    expect(tenderedForReceipt(2, 1000)).toBeNull();
  });
});

describe("quickTenders", () => {
  it("offers exact, then the next bills up", () => {
    expect(quickTenders(350)).toEqual([350, 400, 500, 1000]);
  });

  it("does not repeat an amount that is already round", () => {
    expect(quickTenders(1000)).toEqual([1000]);
    expect(quickTenders(500)).toEqual([500, 1000]);
  });

  it("handles centavos", () => {
    expect(quickTenders(120.5)).toEqual([120.5, 200, 500, 1000]);
  });

  it("offers nothing with nothing selected", () => {
    expect(quickTenders(0)).toEqual([]);
  });
});

describe("summarizeCollections", () => {
  const rows = [
    { total_amount: 100, payment_method: "cash", status: "posted" },
    { total_amount: 200.5, payment_method: "cash", status: "posted" },
    { total_amount: 300, payment_method: "gcash", status: "posted" },
    { total_amount: 999, payment_method: "cash", status: "voided" },
  ];

  it("totals posted receipts only", () => {
    const summary = summarizeCollections(rows);
    expect(summary.total).toBe(600.5);
    expect(summary.receipts).toBe(3);
    expect(summary.voided).toBe(1);
  });

  it("counts only cash as what the drawer should hold", () => {
    expect(summarizeCollections(rows).cash).toBe(300.5);
  });

  it("omits a method nobody used and keeps a fixed order", () => {
    expect(summarizeCollections(rows).byMethod.map((m) => m.method)).toEqual([
      "cash",
      "gcash",
    ]);
  });

  it("is zero, not an error, for an empty period", () => {
    const summary = summarizeCollections([]);
    expect(summary).toMatchObject({ total: 0, receipts: 0, cash: 0, voided: 0 });
  });
});

describe("resolvePeriod", () => {
  const today = "2026-11-06";

  it("defaults to today", () => {
    expect(resolvePeriod(undefined, undefined, today)).toEqual({
      from: today,
      to: today,
    });
  });

  it("treats a lone start date as that single day", () => {
    expect(resolvePeriod("2026-11-01", undefined, today)).toEqual({
      from: "2026-11-01",
      to: "2026-11-01",
    });
  });

  it("puts a backwards range the right way round", () => {
    expect(resolvePeriod("2026-11-05", "2026-11-01", today)).toEqual({
      from: "2026-11-01",
      to: "2026-11-05",
    });
  });

  it("ignores anything that is not a date", () => {
    expect(resolvePeriod("'; drop table", "nope", today)).toEqual({
      from: today,
      to: today,
    });
  });
});

describe("previousDay", () => {
  it("crosses month and year boundaries", () => {
    expect(previousDay("2026-11-01")).toBe("2026-10-31");
    expect(previousDay("2026-01-01")).toBe("2025-12-31");
  });
});
