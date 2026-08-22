import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/utils/csv";

describe("CSV export", () => {
  it("starts with a UTF-8 BOM so Excel does not mangle diacritics", () => {
    const csv = toCsv(["Name"], [["Peña"]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("Peña");
  });

  it("quotes cells containing commas, quotes or newlines", () => {
    const csv = toCsv(["A"], [['Cruz, Juan "JC"']]);
    expect(csv).toContain('"Cruz, Juan ""JC"""');
  });

  it("renders null and undefined as empty cells", () => {
    const csv = toCsv(["A", "B"], [[null, undefined]]);
    expect(csv.split("\r\n")[1]).toBe(",");
  });

  it("uses CRLF line endings", () => {
    expect(toCsv(["A"], [["1"], ["2"]])).toContain("\r\n");
  });
});
