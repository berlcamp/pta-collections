/**
 * Money handling.
 *
 * Postgres stores numeric(12,2). JavaScript has no decimal type, so every
 * arithmetic operation here goes through integer centavos: 0.1 + 0.2 is
 * 0.30000000000000004 in float, and that error compounds across a payment with
 * several lines until the UI total disagrees with the database total.
 *
 * The database is still the authority — create_payment recomputes the total
 * from the lines. This module exists so the UI agrees with it.
 */

/** Peso amount → integer centavos. */
export function toCentavos(amount: number | string): number {
  const n = typeof amount === "string" ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Integer centavos → peso amount, rounded to 2dp. */
export function toPesos(centavos: number): number {
  return Math.round(centavos) / 100;
}

/** Sum peso amounts without float drift. */
export function sumMoney(amounts: (number | string)[]): number {
  return toPesos(amounts.reduce<number>((acc, a) => acc + toCentavos(a), 0));
}

export function addMoney(a: number, b: number): number {
  return toPesos(toCentavos(a) + toCentavos(b));
}

export function subtractMoney(a: number, b: number): number {
  return toPesos(toCentavos(a) - toCentavos(b));
}

/** Clamp a proposed amount into [0, max]. Used by the allocation form. */
export function clampMoney(amount: number, max: number): number {
  const c = toCentavos(amount);
  const m = toCentavos(max);
  if (c < 0) return 0;
  if (c > m) return toPesos(m);
  return toPesos(c);
}

const PHP = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Display format: ₱1,250.00 */
export function formatMoney(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === "") return "₱0.00";
  const n = typeof amount === "string" ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(n)) return "₱0.00";
  return PHP.format(n);
}

/**
 * Export format: a bare number, no symbol and no thousands separators, so
 * Excel treats the column as numeric rather than text (D19).
 */
export function formatMoneyForExport(
  amount: number | string | null | undefined,
): string {
  if (amount === null || amount === undefined || amount === "") return "0.00";
  const n = typeof amount === "string" ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

/** Parse user input ("1,250.00", "₱1250") into a peso number. */
export function parseMoneyInput(input: string): number {
  const cleaned = input.replace(/[^0-9.-]/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? toPesos(toCentavos(n)) : 0;
}
