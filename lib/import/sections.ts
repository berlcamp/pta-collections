/**
 * Matching a CSV's section names against the sections a school has actually
 * defined (D21).
 *
 * The import used to compare names byte-for-byte and silently create anything
 * that missed. That is how "Sampaguita", "sampaguita" and "Sampagita" end up as
 * three sections and every by-section report goes wrong. So:
 *
 *   - a difference only in case, spacing, punctuation or a "Section " prefix is
 *     resolved automatically to the section already on file;
 *   - anything close but not equal is SUGGESTED, never applied — a treasurer
 *     confirms it, because "Rizal" and "Rizal 2" are a typo in one school and
 *     two real sections in the next;
 *   - anything else is a new section, created only after the same confirmation.
 *
 * Pure functions, no database access, so the rules are unit-testable.
 */

/** Above this, the closest existing section is pre-selected for confirmation. */
export const PRESELECT_SCORE = 0.85;
/** Below this, an existing section is not even offered as a suggestion. */
export const SUGGEST_SCORE = 0.72;

export type SectionMatchKind = "exact" | "normalized" | "suggested" | "new";

export interface SectionResolution {
  grade_level: string;
  /** The name exactly as it appears in the file. */
  csv_name: string;
  /** How many rows in the file reference it. */
  rows: number;
  kind: SectionMatchKind;
  /**
   * The existing section this row's students should join, or null to create
   * `csv_name`. For "suggested" this is only a proposal: the wizard makes the
   * user confirm it before anything is staged.
   */
  resolved: string | null;
  /** Existing sections in the same grade, closest first — the picker's options. */
  candidates: { name: string; score: number }[];
}

/**
 * Casefold a section name down to what a human would call "the same name":
 * "Section A", "SEC. A" and "a" all collapse to "a".
 */
export function normalizeSectionName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(section|sect|sec)\s+/, "")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length];
}

/** 1 = identical, 0 = nothing in common. Compared on normalized names. */
export function similarity(a: string, b: string): number {
  const x = normalizeSectionName(a);
  const y = normalizeSectionName(b);
  if (!x && !y) return 1;
  const longest = Math.max(x.length, y.length);
  if (longest === 0) return 1;
  return 1 - levenshtein(x, y) / longest;
}

/**
 * Decide, for every (grade, section) the file references, whether it is a
 * section the school already has or a new one.
 *
 * Sections are matched only WITHIN a grade level: "Section A" of Grade 7 and
 * "Section A" of Grade 8 are different sections, and the unique constraint on
 * pta.sections says so too.
 */
export function resolveFileSections(
  fileSections: { grade_level: string; name: string; rows: number }[],
  existing: { grade_level: string; name: string }[],
): SectionResolution[] {
  return fileSections.map((file) => {
    const inGrade = existing.filter((e) => e.grade_level === file.grade_level);

    const candidates = inGrade
      .map((e) => ({ name: e.name, score: similarity(file.name, e.name) }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    const base = {
      grade_level: file.grade_level,
      csv_name: file.name,
      rows: file.rows,
      candidates,
    };

    const exact = inGrade.find((e) => e.name === file.name);
    if (exact) {
      return { ...base, kind: "exact" as const, resolved: exact.name };
    }

    // Same name, different keyboard: applied without asking, because there is
    // no other section it could plausibly mean.
    const sameName = inGrade.find(
      (e) => normalizeSectionName(e.name) === normalizeSectionName(file.name),
    );
    if (sameName) {
      return { ...base, kind: "normalized" as const, resolved: sameName.name };
    }

    const best = candidates[0];
    if (best && best.score >= SUGGEST_SCORE) {
      return {
        ...base,
        kind: "suggested" as const,
        resolved: best.score >= PRESELECT_SCORE ? best.name : null,
      };
    }

    return { ...base, kind: "new" as const, resolved: null };
  });
}

/** The key a resolution is addressed by, in the wizard and in stageImport. */
export function sectionKey(grade_level: string, name: string): string {
  return `${grade_level}||${name}`;
}

/**
 * The final name each file section should be staged as: the section it was
 * mapped onto, or its own name when it is being created.
 */
export function sectionMapFrom(
  resolutions: SectionResolution[],
  choices: Record<string, string | null>,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const r of resolutions) {
    const key = sectionKey(r.grade_level, r.csv_name);
    const chosen = key in choices ? choices[key] : r.resolved;
    map[key] = chosen ?? r.csv_name;
  }
  return map;
}
