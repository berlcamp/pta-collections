/**
 * A PDF file, written by hand.
 *
 * "No PDF library" (D19) has always meant two things at once, and only one of
 * them is still true. The rule was never about the file format — it was about
 * not carrying jsPDF or pdfmake and their font subsetting, their canvas
 * shims and their megabyte, so that a receipt could be a print stylesheet
 * instead. Every printed document in this project is still exactly that, and
 * this file does not change it.
 *
 * The card roster is the one document that is not printed by the person who
 * asked for it. It is emailed to a printing press, so it has to become a FILE,
 * and a print dialog cannot produce one without a human choosing "Save as PDF"
 * and getting the scale right — at 90% the bars narrow and a scanner starts
 * refusing them.
 *
 * So the same trade `lib/barcode.ts` made: an uncompressed PDF with base-14
 * fonts, no images and no transparency is a header, a handful of dictionaries,
 * a byte-offset table and a trailer. It is written here rather than installed,
 * it is pure, and `npm run test` covers it.
 *
 * DELIBERATE LIMITS, so this stays small enough to be worth hand-writing:
 *
 *   * Base-14 fonts only (Helvetica, Helvetica-Bold, Courier). No embedding,
 *     so no font programs and no subsetting.
 *   * WinAnsiEncoding, which covers Latin-1 — including the Ñ that a Philippine
 *     name roster is full of. Anything outside it becomes '?' rather than
 *     silently shifting every following byte.
 *   * No compression. A roster of two thousand parents is a few hundred KB of
 *     ASCII, and a FlateDecode stream would mean carrying an implementation of
 *     deflate to save a rounding error on an email attachment.
 *
 * Coordinates are PDF user space: points (1/72"), origin at the BOTTOM-left of
 * the page. The callers here work top-down, so they convert once at the edge.
 */

/** A4 in points, which is what every press in the country expects. */
export const A4 = { width: 595.28, height: 841.89 } as const;

export type PdfFont = "Helvetica" | "Helvetica-Bold" | "Courier";

/** The three base-14 fonts, in the order their resource names are assigned. */
const FONTS: PdfFont[] = ["Helvetica", "Helvetica-Bold", "Courier"];

const fontResource = (font: PdfFont) => `/F${FONTS.indexOf(font) + 1}`;

/**
 * WinAnsiEncoding is Latin-1 EXCEPT for 0x80-0x9F, where Latin-1 has unused
 * control codes and WinAnsi has punctuation. Those are the characters this
 * project's own prose reaches for — the em dash, the curly apostrophe, the
 * ellipsis truncate() appends — so they are mapped rather than lost.
 */
const WIN_ANSI: Record<string, number> = {
  "\u20AC": 0x80, "\u201A": 0x82, "\u0192": 0x83, "\u201E": 0x84,
  "\u2026": 0x85, "\u2020": 0x86, "\u2021": 0x87, "\u02C6": 0x88,
  "\u2030": 0x89, "\u0160": 0x8a, "\u2039": 0x8b, "\u0152": 0x8c,
  "\u017D": 0x8e, "\u2018": 0x91, "\u2019": 0x92, "\u201C": 0x93,
  "\u201D": 0x94, "\u2022": 0x95, "\u2013": 0x96, "\u2014": 0x97,
  "\u02DC": 0x98, "\u2122": 0x99, "\u0161": 0x9a, "\u203A": 0x9b,
  "\u0153": 0x9c, "\u017E": 0x9e, "\u0178": 0x9f,
};

/**
 * Everything else above 255 has no byte to become, and is REPLACED rather than
 * dropped: a dropped character would shift the text it sits in, and a roster is
 * read by matching a name against a list.
 *
 * The three PDF string metacharacters are escaped in the same pass.
 */
function pdfString(text: string): string {
  let out = "";
  for (const ch of text) {
    const mapped = WIN_ANSI[ch];
    const c =
      mapped !== undefined
        ? String.fromCharCode(mapped)
        : (ch.codePointAt(0) ?? 63) > 255
          ? "?"
          : ch;
    if (c === "(" || c === ")" || c === "\\") out += "\\" + c;
    else out += c;
  }
  return out;
}

/**
 * One page's content stream, built up by the drawing calls below.
 *
 * The operators are the whole vocabulary needed here: `re f` fills a rectangle,
 * `BT … Tj ET` draws a run of text, and `w … m … l S` strokes a line.
 */
export class PdfPage {
  private ops: string[] = [];

  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  /** `y` is measured DOWN from the top of the page, unlike PDF user space. */
  text(
    x: number,
    y: number,
    content: string,
    options: { font?: PdfFont; size?: number; gray?: number } = {},
  ): this {
    const { font = "Helvetica", size = 9, gray = 0 } = options;
    this.ops.push(
      `q ${gray} g BT ${fontResource(font)} ${size} Tf ` +
        `1 0 0 1 ${round(x)} ${round(this.height - y)} Tm ` +
        `(${pdfString(content)}) Tj ET Q`,
    );
    return this;
  }

  /** A filled rectangle. `y` is its TOP edge, measured down from the page top. */
  rect(
    x: number,
    y: number,
    w: number,
    h: number,
    options: { gray?: number } = {},
  ): this {
    const { gray = 0 } = options;
    this.ops.push(
      `q ${gray} g ${round(x)} ${round(this.height - y - h)} ` +
        `${round(w)} ${round(h)} re f Q`,
    );
    return this;
  }

  /** A horizontal rule. */
  line(
    x: number,
    y: number,
    w: number,
    options: { thickness?: number; gray?: number } = {},
  ): this {
    const { thickness = 0.5, gray = 0 } = options;
    const yy = round(this.height - y);
    this.ops.push(
      `q ${gray} G ${thickness} w ${round(x)} ${yy} m ${round(x + w)} ${yy} l S Q`,
    );
    return this;
  }

  stream(): string {
    return this.ops.join("\n");
  }
}

/**
 * Assemble the pages into a file.
 *
 * The xref table is a list of BYTE offsets, which is the one part of a PDF that
 * cannot be approximated: every entry is a fixed ten digits and must point at
 * the first byte of its object. The document is therefore built as a string in
 * which every code unit is one byte — pdfString() guarantees that — so
 * `length` and "byte offset" are the same number.
 */
export function buildPdf(
  pages: PdfPage[],
  meta: { title?: string } = {},
): Uint8Array {
  const objects: string[] = [];
  /** Returns the 1-based object number PDF refers to it by. */
  const add = (body: string): number => {
    objects.push(body);
    return objects.length;
  };

  // 1 and 2 are reserved for the catalog and the page tree, whose bodies are
  // not known until the page objects exist.
  add("");
  add("");

  const fontIds = FONTS.map((f) =>
    add(
      `<< /Type /Font /Subtype /Type1 /BaseFont /${f} ` +
        `/Encoding /WinAnsiEncoding >>`,
    ),
  );
  const resources =
    `<< /Font << ` +
    FONTS.map((f, i) => `${fontResource(f)} ${fontIds[i]} 0 R`).join(" ") +
    ` >> >>`;

  const pageIds: number[] = [];
  for (const page of pages) {
    const stream = page.stream();
    const contentId = add(
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
    pageIds.push(
      add(
        `<< /Type /Page /Parent 2 0 R ` +
          `/MediaBox [0 0 ${round(page.width)} ${round(page.height)}] ` +
          `/Resources ${resources} /Contents ${contentId} 0 R >>`,
      ),
    );
  }

  objects[0] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[1] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] ` +
    `/Count ${pageIds.length} >>`;

  const infoId = add(
    `<< /Title (${pdfString(meta.title ?? "")}) /Producer (PTA Collections) >>`,
  );

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const startxref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  out +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ` +
    `/Info ${infoId} 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;

  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}

/**
 * Helvetica and Courier advance widths, to three decimals of an em.
 *
 * Only needed to TRUNCATE — a name too long for its column has to be cut at a
 * character, and cutting by a guessed average width either wraps into the next
 * column or wastes a third of it. Courier is monospaced at 0.6.
 */
const HELVETICA_NARROW = new Set(" !\"'(),-./:;I[]ijlt|");
const HELVETICA_WIDE = new Set("ABCDEFGHKLNOPQRSTUVXYZmw%@");

export function textWidth(text: string, font: PdfFont, size: number): number {
  if (font === "Courier") return text.length * 0.6 * size;
  let em = 0;
  for (const ch of text) {
    if (HELVETICA_NARROW.has(ch)) em += 0.3;
    else if (HELVETICA_WIDE.has(ch)) em += 0.72;
    else if (ch >= "A" && ch <= "Z") em += 0.667;
    else em += 0.556;
  }
  return em * size;
}

/** Cut to fit, with an ellipsis, so a long name never crosses into a barcode. */
export function truncate(
  text: string,
  font: PdfFont,
  size: number,
  maxWidth: number,
): string {
  if (textWidth(text, font, size) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && textWidth(cut + "…", font, size) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  // The ellipsis is one byte in WinAnsiEncoding (0x85); WIN_ANSI maps it.
  return cut.trimEnd() + "…";
}

/** PDF wants plain decimals — no exponents, and no more precision than this. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
