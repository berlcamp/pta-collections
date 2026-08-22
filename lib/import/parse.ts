import type { NormalizedImportRow } from "@/types/database.types";
import { normalizeContact, titleCaseName } from "@/lib/utils/names";

/**
 * CSV student import: parsing, normalization and validation (D16).
 *
 * Pure functions — no database access — so they are unit-testable and behave
 * identically in the browser preview and the server-side commit.
 */

export const REQUIRED_COLUMNS = ["first_name", "last_name", "grade_level"] as const;

export const KNOWN_COLUMNS = [
  "lrn", "student_number", "first_name", "middle_name", "last_name", "suffix",
  "birth_date", "sex", "grade_level", "section",
  "guardian1_name", "guardian1_contact", "guardian1_relationship",
  "guardian2_name", "guardian2_contact", "guardian2_relationship",
] as const;

export const RELATIONSHIPS = [
  "Mother", "Father", "Grandparent", "Legal Guardian", "Sibling", "Guardian", "Other",
] as const;

export interface ParsedRow {
  rowNumber: number;
  raw: Record<string, string>;
  normalized: NormalizedImportRow | null;
  errors: string[];
}

/** Canonicalize a header: lowercase, underscores, no stray punctuation. */
export function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export function validateHeaders(headers: string[]): string[] {
  const normalized = headers.map(normalizeHeader);
  return REQUIRED_COLUMNS.filter((c) => !normalized.includes(c)).map(
    (c) => `Missing required column: ${c}`,
  );
}

/** Map a free-text grade value onto the fixed DepEd lookup. */
export function normalizeGradeLevel(
  input: string,
  validCodes: string[],
): string | null {
  const raw = input.trim();
  if (!raw) return null;

  const exact = validCodes.find((c) => c.toLowerCase() === raw.toLowerCase());
  if (exact) return exact;

  if (/^k(inder)?/i.test(raw)) {
    return validCodes.find((c) => c === "Kinder") ?? null;
  }

  // "G7", "Grade 7", "7", "grade7" all collapse to the same code.
  const digits = raw.match(/\d{1,2}/);
  if (digits) {
    const candidate = `Grade ${Number(digits[0])}`;
    return validCodes.find((c) => c === candidate) ?? null;
  }
  return null;
}

export function normalizeSex(input: string): "M" | "F" | null {
  const v = input.trim().toUpperCase();
  if (["M", "MALE", "LALAKI"].includes(v)) return "M";
  if (["F", "FEMALE", "BABAE"].includes(v)) return "F";
  return null;
}

/** Accepts YYYY-MM-DD and slash dates; rejects anything ambiguous or invalid. */
export function normalizeDate(input: string): string | null {
  const v = input.trim();
  if (!v) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

  const slash = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slash) {
    const [, a, b, year] = slash;
    const first = Number(a);
    const second = Number(b);
    // If the first field cannot be a month, it must be the day.
    const [month, day] = first > 12 ? [second, first] : [first, second];
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return null;
}

function normalizeRelationship(input: string): string {
  const v = input.trim().toLowerCase();
  const match = RELATIONSHIPS.find((r) => r.toLowerCase() === v);
  if (match) return match;
  if (["mom", "mother", "nanay", "inay"].includes(v)) return "Mother";
  if (["dad", "father", "tatay", "itay"].includes(v)) return "Father";
  if (["lola", "lolo", "grandmother", "grandfather"].includes(v)) return "Grandparent";
  return "Guardian";
}

export function parseRow(
  raw: Record<string, string>,
  rowNumber: number,
  validGradeCodes: string[],
): ParsedRow {
  const errors: string[] = [];
  const get = (k: string) => (raw[k] ?? "").trim();

  const firstName = get("first_name");
  const lastName = get("last_name");
  if (!firstName) errors.push("first_name is required");
  if (!lastName) errors.push("last_name is required");

  const lrnRaw = get("lrn").replace(/\D/g, "");
  if (lrnRaw && lrnRaw.length !== 12) {
    errors.push(`LRN must be exactly 12 digits (got ${lrnRaw.length})`);
  }

  const gradeLevel = normalizeGradeLevel(get("grade_level"), validGradeCodes);
  if (!gradeLevel) errors.push(`Unrecognised grade level: "${get("grade_level")}"`);

  const birthDateRaw = get("birth_date");
  const birthDate = birthDateRaw ? normalizeDate(birthDateRaw) : null;
  if (birthDateRaw && !birthDate) errors.push(`Unrecognised date: "${birthDateRaw}"`);

  const sexRaw = get("sex");
  const sex = sexRaw ? normalizeSex(sexRaw) : null;
  if (sexRaw && !sex) errors.push(`Unrecognised sex: "${sexRaw}"`);

  const guardians: NormalizedImportRow["guardians"] = [];
  for (const [i, prefix] of ["guardian1", "guardian2"].entries()) {
    const name = get(`${prefix}_name`);
    if (!name) continue;
    guardians.push({
      name: titleCaseName(name),
      contact: normalizeContact(get(`${prefix}_contact`)),
      relationship: normalizeRelationship(get(`${prefix}_relationship`)),
      is_primary: i === 0,
    });
  }

  if (errors.length > 0) return { rowNumber, raw, normalized: null, errors };

  return {
    rowNumber,
    raw,
    errors: [],
    normalized: {
      lrn: lrnRaw || null,
      student_number: get("student_number") || null,
      first_name: titleCaseName(firstName),
      middle_name: get("middle_name") ? titleCaseName(get("middle_name")) : null,
      last_name: titleCaseName(lastName),
      suffix: get("suffix") || null,
      birth_date: birthDate,
      sex,
      grade_level: gradeLevel as string,
      section: get("section") || null,
      guardians,
    },
  };
}

/** Flags rows duplicating an earlier row IN THE SAME FILE. */
export function markInFileDuplicates(rows: ParsedRow[]): Set<number> {
  const seenLrn = new Set<string>();
  const seenNumber = new Set<string>();
  const dupes = new Set<number>();

  for (const row of rows) {
    if (!row.normalized) continue;
    const { lrn, student_number } = row.normalized;
    if (lrn) {
      if (seenLrn.has(lrn)) dupes.add(row.rowNumber);
      else seenLrn.add(lrn);
    }
    if (student_number) {
      if (seenNumber.has(student_number)) dupes.add(row.rowNumber);
      else seenNumber.add(student_number);
    }
  }
  return dupes;
}

/** The distinct (grade, section) pairs a file references. */
export function collectSections(
  rows: ParsedRow[],
): { grade_level: string; name: string }[] {
  const set = new Map<string, { grade_level: string; name: string }>();
  for (const r of rows) {
    if (!r.normalized?.section) continue;
    const key = `${r.normalized.grade_level}||${r.normalized.section}`;
    if (!set.has(key)) {
      set.set(key, {
        grade_level: r.normalized.grade_level,
        name: r.normalized.section,
      });
    }
  }
  return [...set.values()];
}
