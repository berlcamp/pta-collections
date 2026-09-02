import { code128Modules } from "@/lib/barcode";
import { formatCardNumber } from "@/lib/portal/card";
import { A4, PdfPage, buildPdf, truncate } from "@/lib/pdf/writer";

/**
 * The printing press sheet: every active parent card at one school, as a file.
 *
 * Four columns and no more — a number, a name, the digits, and the barcode that
 * encodes them. The press sets one card per parent from this and needs nothing
 * else; a contact number and a child count would be two more columns of a
 * family's details travelling to a third party who has no use for them.
 *
 * Built as a PDF rather than a print stylesheet because this document leaves
 * the building. See lib/pdf/writer.ts for why that is not a reversal of D19.
 */

export type RosterEntry = {
  guardian_name: string;
  card_number: string;
};

export const MARGIN = 36;
const ROW_HEIGHT = 34;

/**
 * Column origins, in points from the left edge.
 *
 * `barcode` is the one that is not a matter of taste: the symbol is a fixed
 * 157pt and everything to the right of this x has to hold it. The test asserts
 * that, because an overflow here does not wrap or clip — it prints over the
 * edge of the paper and the last bars are simply gone.
 */
export const COL = {
  index: MARGIN,
  name: MARGIN + 26,
  number: MARGIN + 250,
  barcode: MARGIN + 360,
} as const;

/** Module width in points. 1.1 keeps a 16-digit Code 128-C inside 160pt. */
const MODULE = 1.1;
const BARCODE_HEIGHT = 24;
const QUIET_ZONE = 10;

export function parentCardRosterPdf({
  schoolName,
  generatedAt,
  entries,
}: {
  schoolName: string;
  /** Already formatted in the school's timezone — this file does no dates. */
  generatedAt: string;
  entries: RosterEntry[];
}): Uint8Array {
  const pages: PdfPage[] = [];
  let page = new PdfPage(A4.width, A4.height);
  let y = 0;

  const startPage = (first: boolean) => {
    page = new PdfPage(A4.width, A4.height);
    pages.push(page);
    y = MARGIN;

    if (first) {
      page.text(MARGIN, y + 12, schoolName, {
        font: "Helvetica-Bold",
        size: 14,
      });
      y += 26;
      page.text(MARGIN, y + 9, "Parent card print list", {
        font: "Helvetica-Bold",
        size: 10,
      });
      y += 20;
      page.text(
        MARGIN,
        y + 8,
        `${entries.length.toLocaleString()} card${entries.length === 1 ? "" : "s"} · generated ${generatedAt}`,
        { size: 8, gray: 0.35 },
      );
      y += 20;
      // The warning that keeps the barcodes scannable, and the one that says
      // what this sheet actually is.
      for (const line of [
        "Print at 100%. Scaling the page narrows the bars and a scanner will start refusing them.",
        "Each number is a parent's sign-in credential. Treat this sheet as confidential and destroy it once the cards are made.",
      ]) {
        page.text(MARGIN, y + 7, line, { size: 7.5, gray: 0.35 });
        y += 11;
      }
      y += 6;
    }

    page.line(MARGIN, y, A4.width - MARGIN * 2, { thickness: 1 });
    y += 12;
    page.text(COL.index, y, "#", { font: "Helvetica-Bold", size: 8 });
    page.text(COL.name, y, "Parent / guardian", {
      font: "Helvetica-Bold",
      size: 8,
    });
    page.text(COL.number, y, "Card number", {
      font: "Helvetica-Bold",
      size: 8,
    });
    page.text(COL.barcode, y, "Barcode", { font: "Helvetica-Bold", size: 8 });
    y += 5;
    page.line(MARGIN, y, A4.width - MARGIN * 2, { thickness: 0.75 });
    y += 4;
  };

  startPage(true);

  entries.forEach((entry, i) => {
    // A row split across a page break puts half a barcode on each side, and
    // half a barcode is not a barcode.
    if (y + ROW_HEIGHT > A4.height - MARGIN) startPage(false);

    const baseline = y + ROW_HEIGHT / 2 + 3;

    page.text(COL.index, baseline, String(i + 1), { size: 8, gray: 0.45 });
    page.text(
      COL.name,
      baseline,
      truncate(entry.guardian_name, "Helvetica", 9, COL.number - COL.name - 10),
      { size: 9 },
    );
    page.text(COL.number, baseline, formatCardNumber(entry.card_number), {
      font: "Courier",
      size: 9,
    });

    drawBarcode(page, COL.barcode, y + (ROW_HEIGHT - BARCODE_HEIGHT) / 2, entry.card_number);

    y += ROW_HEIGHT;
    page.line(MARGIN, y, A4.width - MARGIN * 2, { thickness: 0.25, gray: 0.75 });
  });

  pages.forEach((p, i) => {
    p.text(
      MARGIN,
      A4.height - MARGIN + 10,
      `${schoolName} · Parent card print list · page ${i + 1} of ${pages.length}`,
      { size: 7, gray: 0.45 },
    );
  });

  return buildPdf(pages, { title: `${schoolName} — parent card print list` });
}

/**
 * Code 128 as filled rectangles.
 *
 * The same module widths lib/barcode.ts renders to SVG, drawn straight into the
 * page instead — bars are rectangles in both, and there is no image to embed.
 * The quiet zone is not decorative: without ten modules of white on each side a
 * reader has no way to find the start of the symbol.
 */
function drawBarcode(page: PdfPage, x: number, y: number, digits: string): void {
  const modules = code128Modules(digits);
  let cursor = x + QUIET_ZONE * MODULE;
  let isBar = true;

  for (const width of modules) {
    if (isBar) {
      page.rect(cursor, y, width * MODULE, BARCODE_HEIGHT);
    }
    cursor += width * MODULE;
    isBar = !isBar;
  }
}

/** How wide the finished symbol is, quiet zones included. */
export function barcodeWidth(digits: string): number {
  const total = code128Modules(digits).reduce((a, b) => a + b, 0);
  return (total + QUIET_ZONE * 2) * MODULE;
}
