import { isValidCardNumber } from "@/lib/portal/card";

/**
 * Telling a barcode scanner from a person, using only key timing.
 *
 * A scanner is a keyboard that types sixteen digits in a few tens of
 * milliseconds and usually presses Enter. The cashier is often not in the scan
 * box when the next parent walks up — they just clicked a checkbox, or the
 * cursor is in an amount — so the desk listens to the whole window. Timing is
 * what stops it treating a typed amount as a card: nobody keys sixteen digits
 * at under 50 ms apiece.
 *
 * Pure so it can be tested without a DOM.
 */
export const SCAN_MAX_GAP_MS = 50;

/** How long after a scan its trailing Enter is still treated as part of it. */
const TRAILING_ENTER_MS = 150;

/** A burst this long ending in Enter was a scanner, whatever it was reading. */
const MIN_BURST_LENGTH = 8;

export type ScanEvent =
  /** Not a scanner, as far as we can tell. Leave the key alone. */
  | { type: "none" }
  /** Sixteen fast digits with a valid check digit. */
  | { type: "scan"; card: string }
  /** A scanner burst that is not a card. Ask for another scan. */
  | { type: "misread" }
  /** The Enter that ended a scan. It must not press whatever has focus. */
  | { type: "swallow" };

export interface ScanBuffer {
  feed(key: string, at: number): ScanEvent;
}

export function createScanBuffer(maxGapMs: number = SCAN_MAX_GAP_MS): ScanBuffer {
  let digits = "";
  let lastAt = Number.NEGATIVE_INFINITY;
  let swallowEnterUntil = Number.NEGATIVE_INFINITY;

  return {
    feed(key, at) {
      if (/^[0-9]$/.test(key)) {
        if (at - lastAt > maxGapMs) digits = "";
        digits += key;
        lastAt = at;

        if (digits.length < 16) return { type: "none" };

        const card = digits;
        digits = "";
        swallowEnterUntil = at + TRAILING_ENTER_MS;
        return isValidCardNumber(card)
          ? { type: "scan", card }
          : { type: "misread" };
      }

      if (key === "Enter") {
        const burst = digits;
        const inBurst = at - lastAt <= maxGapMs;
        digits = "";

        if (at <= swallowEnterUntil) {
          swallowEnterUntil = Number.NEGATIVE_INFINITY;
          return { type: "swallow" };
        }
        if (inBurst && burst.length >= MIN_BURST_LENGTH) {
          return { type: "misread" };
        }
        return { type: "none" };
      }

      digits = "";
      return { type: "none" };
    },
  };
}
