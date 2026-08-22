import { describe, expect, it } from "vitest";
import {
  collectSections,
  markInFileDuplicates,
  normalizeDate,
  normalizeGradeLevel,
  normalizeHeader,
  normalizeSex,
  parseRow,
  validateHeaders,
} from "@/lib/import/parse";

const GRADES = [
  "Kinder", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6",
  "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12",
];

describe("headers", () => {
  it("canonicalizes messy header text", () => {
    expect(normalizeHeader("  First Name ")).toBe("first_name");
    expect(normalizeHeader("LRN")).toBe("lrn");
    expect(normalizeHeader("Guardian1-Contact")).toBe("guardian1_contact");
  });

  it("reports missing required columns", () => {
    expect(validateHeaders(["first_name", "last_name", "grade_level"])).toEqual([]);
    expect(validateHeaders(["first_name"])).toHaveLength(2);
  });
});

describe("grade level normalization", () => {
  it("collapses the four ways a school writes Grade 7", () => {
    for (const input of ["Grade 7", "GRADE 7", "G7", "7", "grade7"]) {
      expect(normalizeGradeLevel(input, GRADES)).toBe("Grade 7");
    }
  });

  it("handles Kinder", () => {
    expect(normalizeGradeLevel("Kinder", GRADES)).toBe("Kinder");
    expect(normalizeGradeLevel("K", GRADES)).toBe("Kinder");
  });

  it("rejects a grade the school does not have", () => {
    expect(normalizeGradeLevel("Grade 13", GRADES)).toBeNull();
    expect(normalizeGradeLevel("nonsense", GRADES)).toBeNull();
  });
});

describe("value normalization", () => {
  it("normalizes sex including Filipino terms", () => {
    expect(normalizeSex("male")).toBe("M");
    expect(normalizeSex("Babae")).toBe("F");
    expect(normalizeSex("x")).toBeNull();
  });

  it("parses ISO and slash dates", () => {
    expect(normalizeDate("2012-05-14")).toBe("2012-05-14");
    expect(normalizeDate("5/14/2012")).toBe("2012-05-14");
    expect(normalizeDate("14/5/2012")).toBe("2012-05-14");
    expect(normalizeDate("")).toBeNull();
    expect(normalizeDate("not a date")).toBeNull();
    expect(normalizeDate("13/13/2012")).toBeNull();
  });
});

describe("row parsing", () => {
  const good = {
    lrn: "123456789012",
    first_name: "juan",
    middle_name: "dela",
    last_name: "cruz",
    grade_level: "G7",
    section: "Section A",
    guardian1_name: "maria dela cruz",
    guardian1_contact: "+63 917 123 4567",
    guardian1_relationship: "nanay",
  };

  it("normalizes a valid row", () => {
    const row = parseRow(good, 2, GRADES);
    expect(row.errors).toEqual([]);
    expect(row.normalized).toMatchObject({
      lrn: "123456789012",
      first_name: "Juan",
      last_name: "Cruz",
      grade_level: "Grade 7",
      section: "Section A",
    });
    expect(row.normalized!.guardians[0]).toMatchObject({
      name: "Maria Dela Cruz",
      contact: "09171234567",
      relationship: "Mother",
      is_primary: true,
    });
  });

  it("requires first and last name", () => {
    const row = parseRow({ ...good, first_name: "", last_name: "" }, 2, GRADES);
    expect(row.errors).toHaveLength(2);
    expect(row.normalized).toBeNull();
  });

  it("rejects an LRN that is not 12 digits", () => {
    const row = parseRow({ ...good, lrn: "12345" }, 2, GRADES);
    expect(row.errors[0]).toMatch(/12 digits/);
  });

  it("accepts a row with no LRN at all", () => {
    const row = parseRow({ ...good, lrn: "" }, 2, GRADES);
    expect(row.errors).toEqual([]);
    expect(row.normalized!.lrn).toBeNull();
  });

  it("marks the first guardian primary and the second not", () => {
    const row = parseRow(
      { ...good, guardian2_name: "Jose Cruz", guardian2_relationship: "tatay" },
      2,
      GRADES,
    );
    expect(row.normalized!.guardians.map((g) => g.is_primary)).toEqual([true, false]);
    expect(row.normalized!.guardians[1].relationship).toBe("Father");
  });
});

describe("duplicate detection", () => {
  it("flags a repeated LRN within the same file, keeping the first", () => {
    const rows = [
      parseRow({ lrn: "111111111111", first_name: "A", last_name: "X", grade_level: "7" }, 2, GRADES),
      parseRow({ lrn: "111111111111", first_name: "B", last_name: "Y", grade_level: "7" }, 3, GRADES),
      parseRow({ lrn: "222222222222", first_name: "C", last_name: "Z", grade_level: "7" }, 4, GRADES),
    ];
    expect([...markInFileDuplicates(rows)]).toEqual([3]);
  });

  it("flags a repeated student number", () => {
    const rows = [
      parseRow({ student_number: "2026-001", first_name: "A", last_name: "X", grade_level: "7" }, 2, GRADES),
      parseRow({ student_number: "2026-001", first_name: "B", last_name: "Y", grade_level: "7" }, 3, GRADES),
    ];
    expect([...markInFileDuplicates(rows)]).toEqual([3]);
  });
});

describe("section collection", () => {
  it("returns the distinct grade/section pairs a file references", () => {
    const rows = [
      parseRow({ first_name: "A", last_name: "X", grade_level: "7", section: "Section A" }, 2, GRADES),
      parseRow({ first_name: "B", last_name: "Y", grade_level: "7", section: "Section A" }, 3, GRADES),
      parseRow({ first_name: "C", last_name: "Z", grade_level: "8", section: "Rizal" }, 4, GRADES),
    ];
    expect(collectSections(rows)).toEqual([
      { grade_level: "Grade 7", name: "Section A" },
      { grade_level: "Grade 8", name: "Rizal" },
    ]);
  });
});
