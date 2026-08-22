/**
 * CSV export (D19).
 *
 * UTF-8 BOM is mandatory: without it Excel on Windows reads the file as
 * Latin-1 and mangles Filipino names with ñ and diacritics.
 *
 * Money columns must be passed already formatted by formatMoneyForExport —
 * bare numbers with no ₱ and no thousands separators — so Excel treats them
 * as numeric rather than as text.
 */

const BOM = "﻿";

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][],
): string {
  const lines = [
    headers.map(escapeCell).join(","),
    ...rows.map((r) => r.map(escapeCell).join(",")),
  ];
  return BOM + lines.join("\r\n");
}

export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
