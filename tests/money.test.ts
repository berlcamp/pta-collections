import { describe, expect, it } from "vitest";
import {
  addMoney,
  clampMoney,
  formatMoney,
  formatMoneyForExport,
  parseMoneyInput,
  subtractMoney,
  sumMoney,
  toCentavos,
  toPesos,
} from "@/lib/financial/money";

describe("money arithmetic", () => {
  it("avoids float drift that plain addition produces", () => {
    // 0.1 + 0.2 === 0.30000000000000004 in IEEE-754 floats.
    expect(addMoney(0.1, 0.2)).toBe(0.3);
    expect(sumMoney([0.1, 0.2, 0.3])).toBe(0.6);
  });

  it("sums a realistic multi-line payment exactly", () => {
    expect(sumMoney([100.0, 50.0, 33.33, 16.67])).toBe(200);
  });

  it("survives a long chain of additions", () => {
    const lines = Array.from({ length: 100 }, () => 0.07);
    expect(sumMoney(lines)).toBe(7);
  });

  it("converts to and from centavos without loss", () => {
    expect(toCentavos(1250.55)).toBe(125055);
    expect(toPesos(125055)).toBe(1250.55);
    expect(toCentavos("99.99")).toBe(9999);
  });

  it("subtracts change correctly", () => {
    expect(subtractMoney(200, 150)).toBe(50);
    expect(subtractMoney(100, 33.33)).toBe(66.67);
  });

  it("clamps an allocation line to its balance", () => {
    expect(clampMoney(150, 100)).toBe(100);
    expect(clampMoney(50, 100)).toBe(50);
    expect(clampMoney(-10, 100)).toBe(0);
    expect(clampMoney(100.005, 100)).toBe(100);
  });
});

describe("money formatting", () => {
  it("formats as Philippine pesos for display", () => {
    expect(formatMoney(1250)).toBe("₱1,250.00");
    expect(formatMoney(0)).toBe("₱0.00");
    expect(formatMoney(null)).toBe("₱0.00");
    expect(formatMoney("99.5")).toBe("₱99.50");
  });

  it("exports bare numbers so Excel keeps the column numeric", () => {
    expect(formatMoneyForExport(1250)).toBe("1250.00");
    expect(formatMoneyForExport(null)).toBe("0.00");
    expect(formatMoneyForExport(0.1)).toBe("0.10");
    // No currency symbol and no thousands separator, or Excel reads it as text.
    expect(formatMoneyForExport(1234567.89)).not.toContain(",");
    expect(formatMoneyForExport(1234567.89)).not.toContain("₱");
  });

  it("parses whatever a cashier types", () => {
    expect(parseMoneyInput("1,250.00")).toBe(1250);
    expect(parseMoneyInput("₱99.50")).toBe(99.5);
    expect(parseMoneyInput("")).toBe(0);
    expect(parseMoneyInput("abc")).toBe(0);
  });
});
