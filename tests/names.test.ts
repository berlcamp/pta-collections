import { describe, expect, it } from "vitest";
import {
  formatNameFull,
  formatNameListing,
  normalizeContact,
  titleCaseName,
} from "@/lib/utils/names";

const juan = {
  first_name: "Juan",
  middle_name: "Dela",
  last_name: "Cruz",
  suffix: "Jr.",
};

describe("name formatting", () => {
  it("formats a listing name with a middle initial", () => {
    expect(formatNameListing(juan)).toBe("Cruz, Juan D. Jr.");
  });

  it("formats a full name for receipts", () => {
    expect(formatNameFull(juan)).toBe("Juan Dela Cruz Jr.");
  });

  it("handles a missing middle name and suffix", () => {
    const p = { first_name: "Ana", middle_name: null, last_name: "Reyes", suffix: null };
    expect(formatNameListing(p)).toBe("Reyes, Ana");
    expect(formatNameFull(p)).toBe("Ana Reyes");
  });

  it("title-cases names typed in any case, keeping hyphens", () => {
    expect(titleCaseName("  juan   DELA cruz ")).toBe("Juan Dela Cruz");
    expect(titleCaseName("maria-luz santos")).toBe("Maria-Luz Santos");
    expect(titleCaseName("o'brien")).toBe("O'Brien");
  });
});

describe("PH contact normalization", () => {
  it("normalizes every common way a mobile number is written", () => {
    expect(normalizeContact("09171234567")).toBe("09171234567");
    expect(normalizeContact("+63 917 123 4567")).toBe("09171234567");
    expect(normalizeContact("639171234567")).toBe("09171234567");
    expect(normalizeContact("9171234567")).toBe("09171234567");
    expect(normalizeContact("0917-123-4567")).toBe("09171234567");
  });

  it("returns null for blank input", () => {
    expect(normalizeContact("")).toBeNull();
    expect(normalizeContact(null)).toBeNull();
  });
});
