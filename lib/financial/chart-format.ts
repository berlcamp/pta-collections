/**
 * Axis tick formatting for money.
 *
 * A fixed "₱{v/1000}k" formatter renders every tick as "₱0k" for a school
 * collecting ₱100 a day, which is most of them. Scale to the data instead.
 */
export function moneyAxisTick(value: number, max: number): string {
  if (max >= 1_000_000) return `₱${(value / 1_000_000).toFixed(1)}M`;
  if (max >= 10_000) return `₱${Math.round(value / 1000)}k`;
  if (max >= 1_000) return `₱${(value / 1000).toFixed(1)}k`;
  return `₱${Math.round(value)}`;
}

/** Compact label drawn directly on a bar. */
export function moneyBarLabel(value: number): string {
  if (value >= 1_000_000) return `₱${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `₱${Math.round(value / 1000)}k`;
  return `₱${value.toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
}
