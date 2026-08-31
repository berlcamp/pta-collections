/**
 * Code 128-C, rendered as inline SVG.
 *
 * Hand-written rather than pulled in, for the same reason this project has no
 * PDF library: the whole encoder is a lookup table and two loops, and the card
 * printing screen is not worth a dependency. `npm run test` covers it, which is
 * exactly what that suite is for — pure logic, no database.
 *
 * SUBSET C, not B. Subset C encodes digits in PAIRS, so a 16-digit card number
 * is 8 data symbols instead of 16. The finished barcode is 123 modules wide
 * rather than 211 — on a card the size of a driving licence that is the
 * difference between comfortable bars and a scan that fails at an angle.
 *
 * Structure: START-C, 8 data symbols, a modulo-103 checksum, STOP. Every symbol
 * is 11 modules of alternating bars and spaces except STOP, which is 13.
 */

/** Bar/space widths per symbol value, 0–106. Index 106 is STOP. */
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312",
  "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222",
  "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131",
  "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321",
  "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121",
  "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224",
  "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
  "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112",
  "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113",
  "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412",
  "211214", "211232", "2331112",
] as const;

const START_C = 105;
const STOP = 106;

/**
 * Symbol values for a digit string. Throws on anything that is not an even
 * number of digits — subset C cannot express an odd tail, and silently falling
 * back to subset B would produce a barcode of a different width than the layout
 * reserved for it.
 */
export function encodeCode128C(digits: string): number[] {
  if (!/^[0-9]+$/.test(digits) || digits.length % 2 !== 0) {
    throw new Error(
      `Code 128-C needs an even number of digits, got ${JSON.stringify(digits)}`,
    );
  }

  const values: number[] = [START_C];
  for (let i = 0; i < digits.length; i += 2) {
    values.push(Number(digits.slice(i, i + 2)));
  }

  // Weighted modulo-103 checksum. The start symbol has weight 1, and the first
  // DATA symbol has weight 1 as well — not 2 — which is the detail every
  // hand-rolled Code 128 gets wrong once.
  let sum = START_C;
  for (let i = 1; i < values.length; i++) sum += values[i] * i;
  values.push(sum % 103);

  values.push(STOP);
  return values;
}

/** Widths of alternating bars and spaces, starting with a bar. */
export function code128Modules(digits: string): number[] {
  return encodeCode128C(digits)
    .flatMap((v) => PATTERNS[v].split("").map(Number));
}

export type BarcodeOptions = {
  /** Module width in px. 2 survives a phone camera and a cheap laser alike. */
  moduleWidth?: number;
  height?: number;
  /** Quiet zone in modules. The spec's minimum is 10 and it is not decorative. */
  quietZone?: number;
  className?: string;
};

/**
 * An SVG string. Bars only — the human-readable number is rendered as ordinary
 * HTML beside it, so it can use the page's font instead of an SVG <text> that
 * prints badly.
 */
export function code128Svg(digits: string, options: BarcodeOptions = {}): string {
  const { moduleWidth = 2, height = 56, quietZone = 10, className } = options;

  const modules = code128Modules(digits);
  const total = modules.reduce((a, b) => a + b, 0) + quietZone * 2;

  let x = quietZone;
  let isBar = true;
  const rects: string[] = [];

  for (const width of modules) {
    if (isBar) {
      rects.push(
        `<rect x="${x * moduleWidth}" y="0" width="${width * moduleWidth}" height="${height}"/>`,
      );
    }
    x += width;
    isBar = !isBar;
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg"`,
    ` viewBox="0 0 ${total * moduleWidth} ${height}"`,
    ` width="${total * moduleWidth}" height="${height}"`,
    className ? ` class="${className}"` : "",
    ` shape-rendering="crispEdges" fill="currentColor"`,
    ` role="img" aria-label="Barcode ${digits}">`,
    rects.join(""),
    `</svg>`,
  ].join("");
}
