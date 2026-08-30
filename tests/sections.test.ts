import { describe, expect, it } from "vitest";
import {
  normalizeSectionName,
  resolveFileSections,
  sectionMapFrom,
  sectionKey,
  similarity,
} from "@/lib/import/sections";

const EXISTING = [
  { grade_level: "Grade 7", name: "Sampaguita" },
  { grade_level: "Grade 7", name: "Rizal" },
  { grade_level: "Grade 8", name: "Section A" },
];

describe("normalizeSectionName", () => {
  it("collapses case, punctuation and a Section prefix", () => {
    expect(normalizeSectionName("Section A")).toBe("a");
    expect(normalizeSectionName("SEC. A")).toBe("a");
    expect(normalizeSectionName("  section   a ")).toBe("a");
    expect(normalizeSectionName("St. Paul")).toBe("st paul");
  });

  it("keeps a name that only begins with the letters of 'section'", () => {
    expect(normalizeSectionName("Secretariat")).toBe("secretariat");
  });
});

describe("similarity", () => {
  it("is 1 for names that differ only in case or spacing", () => {
    expect(similarity("Sampaguita", "  SAMPAGUITA ")).toBe(1);
  });

  it("ranks a typo above an unrelated name", () => {
    expect(similarity("Sampagita", "Sampaguita")).toBeGreaterThan(
      similarity("Sampagita", "Rizal"),
    );
  });
});

describe("resolveFileSections", () => {
  const resolve = (name: string, grade = "Grade 7") =>
    resolveFileSections([{ grade_level: grade, name, rows: 3 }], EXISTING)[0];

  it("matches an identical name without asking", () => {
    const r = resolve("Sampaguita");
    expect(r.kind).toBe("exact");
    expect(r.resolved).toBe("Sampaguita");
  });

  it("resolves a case- or spacing-only difference automatically", () => {
    const r = resolve("sampaguita ");
    expect(r.kind).toBe("normalized");
    expect(r.resolved).toBe("Sampaguita");
  });

  it("resolves a 'Section A' / 'A' difference within the same grade", () => {
    const r = resolve("A", "Grade 8");
    expect(r.kind).toBe("normalized");
    expect(r.resolved).toBe("Section A");
  });

  it("suggests a close misspelling instead of applying it", () => {
    const r = resolve("Sampagita");
    expect(r.kind).toBe("suggested");
    expect(r.candidates[0].name).toBe("Sampaguita");
  });

  it("treats an unrelated name as a new section", () => {
    const r = resolve("Bonifacio");
    expect(r.kind).toBe("new");
    expect(r.resolved).toBeNull();
  });

  it("never matches across grade levels", () => {
    const r = resolve("Sampaguita", "Grade 9");
    expect(r.kind).toBe("new");
    expect(r.candidates).toEqual([]);
  });
});

describe("sectionMapFrom", () => {
  it("prefers the user's choice over the proposed match", () => {
    const resolutions = resolveFileSections(
      [{ grade_level: "Grade 7", name: "Sampagita", rows: 3 }],
      EXISTING,
    );
    const key = sectionKey("Grade 7", "Sampagita");

    expect(sectionMapFrom(resolutions, { [key]: "Rizal" })[key]).toBe("Rizal");
    // null is an explicit "create it as written", not an absent answer.
    expect(sectionMapFrom(resolutions, { [key]: null })[key]).toBe("Sampagita");
  });

  it("falls back to the automatic match when the user made no choice", () => {
    const resolutions = resolveFileSections(
      [{ grade_level: "Grade 7", name: "sampaguita", rows: 1 }],
      EXISTING,
    );
    const key = sectionKey("Grade 7", "sampaguita");
    expect(sectionMapFrom(resolutions, {})[key]).toBe("Sampaguita");
  });
});
