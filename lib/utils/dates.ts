import { formatInTimeZone } from "./tz";

/**
 * Date handling.
 *
 * IMPORTANT (D11): reporting boundaries — "today's collections", monthly totals,
 * the annual report — are computed IN SQL in the school's timezone, never here.
 * Postgres runs UTC; a payment at 07:30 Manila is "yesterday" in UTC, so a
 * browser-side bucket would make the cashier's drawer disagree with the
 * treasurer's report every single morning.
 *
 * This module is for DISPLAY only, plus producing the Manila-local "today"
 * string used to seed date-range filters.
 */

export const DEFAULT_TIMEZONE = "Asia/Manila";

/** Today's calendar date in the school's timezone, as YYYY-MM-DD. */
export function todayInTimezone(timeZone: string = DEFAULT_TIMEZONE): string {
  return formatInTimeZone(new Date(), timeZone);
}

/** First day of the current month in the school's timezone, as YYYY-MM-DD. */
export function startOfMonthInTimezone(
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  return `${todayInTimezone(timeZone).slice(0, 7)}-01`;
}

/** Display a timestamptz in the school's timezone. */
export function formatDateTime(
  iso: string | null | undefined,
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function formatDate(
  iso: string | null | undefined,
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  if (!iso) return "—";
  // A bare YYYY-MM-DD is already a calendar date; don't shift it through a zone.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Date(`${iso}T12:00:00Z`)
    : new Date(iso);
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: /^\d{4}-\d{2}-\d{2}$/.test(iso) ? "UTC" : timeZone,
    dateStyle: "medium",
  }).format(date);
}

/** "2026-06" → "June 2026" */
export function formatMonth(month: string): string {
  const [y, m] = month.split("-");
  return new Intl.DateTimeFormat("en-PH", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(y), Number(m) - 1, 1)));
}
