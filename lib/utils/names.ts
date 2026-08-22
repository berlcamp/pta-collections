import type { Student } from "@/types/database.types";

type NameParts = Pick<Student, "first_name" | "middle_name" | "last_name" | "suffix">;

/** "Dela Cruz, Juan S." — the order a school office expects in a list. */
export function formatNameListing(p: NameParts): string {
  const middle = p.middle_name ? ` ${p.middle_name.charAt(0)}.` : "";
  const suffix = p.suffix ? ` ${p.suffix}` : "";
  return `${p.last_name}, ${p.first_name}${middle}${suffix}`.trim();
}

/** "Juan Dela Cruz" — for receipts and headings. */
export function formatNameFull(p: NameParts): string {
  return [p.first_name, p.middle_name, p.last_name, p.suffix]
    .filter(Boolean)
    .join(" ");
}

/** Title-case a name typed in any case; preserves internal hyphens. */
export function titleCaseName(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/(^|[\s\-'])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

/** Normalize a PH mobile number to 09XXXXXXXXX where recognisable. */
export function normalizeContact(input: string | null | undefined): string | null {
  if (!input) return null;
  const d = input.replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 11 && d.startsWith("09")) return d;
  if (d.length === 12 && d.startsWith("639")) return `0${d.slice(2)}`;
  if (d.length === 13 && d.startsWith("0639")) return `0${d.slice(3)}`;
  if (d.length === 10 && d.startsWith("9")) return `0${d}`;
  return d;
}
