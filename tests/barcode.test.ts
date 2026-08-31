import { describe, expect, it } from "vitest";

import { code128Modules, code128Svg, encodeCode128C } from "@/lib/barcode";
import {
  formatCardNumber,
  isValidCardNumber,
  looksLikeCardScan,
  normalizeCardNumber,
} from "@/lib/portal/card";

describe("Code 128-C", () => {
  it("frames the payload with START-C, a checksum and STOP", () => {
    const values = encodeCode128C("12345678");
    expect(values[0]).toBe(105);
    expect(values.slice(1, 5)).toEqual([12, 34, 56, 78]);
    expect(values.at(-1)).toBe(106);
    expect(values).toHaveLength(7); // start + 4 data + check + stop
  });

  // The reference example from the Code 128 spec. If the weighting is wrong —
  // the classic off-by-one where the first data symbol is given weight 2 — this
  // is the assertion that fails.
  it("computes the modulo-103 checksum the way the spec does", () => {
    expect(encodeCode128C("00")[2]).toBe((105 + 0 * 1) % 103);
    expect(encodeCode128C("1234")[3]).toBe((105 + 12 * 1 + 34 * 2) % 103);
  });

  it("refuses an odd number of digits rather than silently changing subset", () => {
    expect(() => encodeCode128C("123")).toThrow(/even number of digits/);
    expect(() => encodeCode128C("12a4")).toThrow();
    expect(() => encodeCode128C("")).toThrow();
  });

  it("emits 11 modules per symbol and 13 for the stop", () => {
    const modules = code128Modules("3782822463100051");
    // start + 8 data + checksum = 10 symbols at 11 modules, then stop at 13.
    expect(modules.reduce((a, b) => a + b, 0)).toBe(10 * 11 + 13);
  });

  it("starts with a bar and ends with a bar", () => {
    const modules = code128Modules("3782822463100051");
    expect(modules.length % 2).toBe(1);
  });

  it("renders SVG with a quiet zone on both sides", () => {
    const svg = code128Svg("3782822463100051", { moduleWidth: 2, quietZone: 10 });
    expect(svg).toContain("<svg");
    expect(svg).toContain('aria-label="Barcode 3782822463100051"');
    // First bar starts after the quiet zone, never at x=0.
    expect(svg).toContain('<rect x="20"');
  });
});

describe("parent card numbers", () => {
  // Mirrors pta.luhn_ok(). If these two ever disagree, a scanner tells the
  // parent their own card is invalid.
  it("accepts a valid check digit and rejects a single-digit typo", () => {
    expect(isValidCardNumber("4539578763621486")).toBe(true);
    expect(isValidCardNumber("4539578763621487")).toBe(false);
  });

  it("rejects anything that is not exactly 16 digits", () => {
    expect(isValidCardNumber("45395787636214")).toBe(false);
    expect(isValidCardNumber("45395787636214860")).toBe(false);
    expect(isValidCardNumber("")).toBe(false);
  });

  // A scanner is a keyboard, and keyboards pick up stray whitespace.
  it("tolerates the punctuation a scanner or a thumb inserts", () => {
    expect(isValidCardNumber("4539 5787 6362 1486")).toBe(true);
    expect(isValidCardNumber("4539-5787-6362-1486")).toBe(true);
    expect(normalizeCardNumber(" 4539 5787 ")).toBe("45395787");
  });

  it("groups the number for a human reading it off a card", () => {
    expect(formatCardNumber("4539578763621486")).toBe("4539 5787 6362 1486");
  });

  // The POS search box has to tell a scan from a name without a round trip.
  // The check digit is what stops a 16-digit LRN being read as a card.
  it("recognises a scan, and only a scan", () => {
    expect(looksLikeCardScan("4539578763621486")).toBe(true);
    expect(looksLikeCardScan("4539578763621487")).toBe(false);
    expect(looksLikeCardScan("Bautista, Precious")).toBe(false);
    expect(looksLikeCardScan("123456789012")).toBe(false);
  });
});
