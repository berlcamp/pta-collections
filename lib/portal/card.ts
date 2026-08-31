/**
 * Parent card numbers: 15 CSPRNG digits plus a Luhn check digit.
 *
 * The mirror of `pta.luhn_ok()`. It exists on this side so a mis-scanned
 * barcode fails in the browser instead of travelling to the server and being
 * counted as a wrong-card login attempt against the IP throttle — and so the
 * POS search box can tell "this is a card" from "this is a name" without a
 * round trip.
 *
 * Generation lives ONLY in SQL (`pta.generate_card_number`). A card number is a
 * credential, and minting one is an issuance decision with an audit row
 * attached; there is deliberately no TypeScript that can invent one.
 */

/** A 16-digit string whose check digit agrees. */
export function isValidCardNumber(input: string): boolean {
  const digits = normalizeCardNumber(input);
  if (!/^[0-9]{16}$/.test(digits)) return false;

  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Barcode scanners are keyboards, and a tired thumb adds spaces. Strip
 * everything that is not a digit rather than rejecting a scan for punctuation
 * the reader inserted.
 */
export function normalizeCardNumber(input: string): string {
  return (input ?? "").replace(/[^0-9]/g, "");
}

/** "3782 8224 6310 0051" — grouped for a human reading it off a card. */
export function formatCardNumber(input: string): string {
  return normalizeCardNumber(input).replace(/(.{4})(?=.)/g, "$1 ").trim();
}

/**
 * Does this look like somebody scanning a card into the POS search box, rather
 * than typing a name? Sixteen digits AND a valid check digit — the check digit
 * is what stops a 16-digit LRN being mistaken for a card.
 */
export function looksLikeCardScan(input: string): boolean {
  const digits = normalizeCardNumber(input);
  return digits.length === 16 && isValidCardNumber(digits);
}
