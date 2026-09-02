import { describe, expect, it } from "vitest";

import { A4, PdfPage, buildPdf, textWidth, truncate } from "@/lib/pdf/writer";
import {
  COL,
  MARGIN,
  barcodeWidth,
  parentCardRosterPdf,
} from "@/lib/pdf/parent-card-roster";

const decode = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => String.fromCharCode(b)).join("");

describe("PDF writer", () => {
  it("frames a file the way a reader looks for one", () => {
    const pdf = decode(buildPdf([new PdfPage(A4.width, A4.height)]));
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(pdf).toContain("/Type /Catalog");
    expect(pdf).toContain("/Type /Pages");
    expect(pdf).toContain("/Type /Page ");
  });

  /**
   * The one part of a PDF that cannot be approximated. Every xref entry is a
   * byte offset that must land on the first byte of "N 0 obj"; a reader that
   * follows a wrong one reports a damaged file and shows nothing.
   */
  it("writes an xref table whose offsets actually point at their objects", () => {
    const pdf = decode(
      buildPdf([new PdfPage(A4.width, A4.height).text(40, 40, "Cruz, Ana")]),
    );

    const startxref = Number(pdf.slice(pdf.lastIndexOf("startxref") + 9).trim().split("\n")[0]);
    expect(pdf.slice(startxref, startxref + 4)).toBe("xref");

    const table = pdf.slice(startxref);
    const entries = [...table.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) =>
      Number(m[1]),
    );
    expect(entries.length).toBeGreaterThan(0);
    entries.forEach((offset, i) => {
      expect(pdf.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(
        `${i + 1} 0 obj`,
      );
    });
  });

  it("declares a stream length in bytes that matches the stream", () => {
    const pdf = decode(
      buildPdf([new PdfPage(A4.width, A4.height).text(40, 40, "Ñoño")]),
    );
    const declared = Number(/\/Length (\d+) >>/.exec(pdf)?.[1]);
    const stream = pdf.slice(
      pdf.indexOf("stream\n") + 7,
      pdf.indexOf("\nendstream"),
    );
    expect(stream).toHaveLength(declared);
  });

  it("is all single bytes — an offset table cannot survive anything else", () => {
    const bytes = buildPdf([
      new PdfPage(A4.width, A4.height).text(40, 40, "Peña — “Bantay” … 20€"),
    ]);
    expect(Array.from(bytes).every((b) => b >= 0 && b <= 255)).toBe(true);
  });

  /**
   * WinAnsiEncoding is Latin-1 except for 0x80-0x9F, which is where the em
   * dash, the curly quotes and truncate()'s ellipsis live. Dropping them would
   * be invisible in the file and wrong on the page.
   */
  it("maps the WinAnsi punctuation range instead of losing it", () => {
    const pdf = decode(
      buildPdf([new PdfPage(A4.width, A4.height).text(0, 0, "a—b…c’d")]),
    );
    expect(pdf).toContain(
      `a${String.fromCharCode(0x97)}b${String.fromCharCode(0x85)}c${String.fromCharCode(0x92)}d`,
    );
    expect(pdf).toContain("/Encoding /WinAnsiEncoding");
  });

  it("escapes the three characters that would end a string early", () => {
    const pdf = decode(
      buildPdf([new PdfPage(A4.width, A4.height).text(0, 0, "Cruz (Jr.) \\ (x)")]),
    );
    expect(pdf).toContain("(Cruz \\(Jr.\\) \\\\ \\(x\\)) Tj");
  });

  it("replaces a character it cannot encode rather than dropping it", () => {
    const pdf = decode(
      buildPdf([new PdfPage(A4.width, A4.height).text(0, 0, "Cruz 日本")]),
    );
    expect(pdf).toContain("(Cruz ??) Tj");
  });
});

describe("column fitting", () => {
  it("leaves a name that fits completely alone", () => {
    expect(truncate("Cruz, Ana Maria", "Helvetica", 9, 200)).toBe(
      "Cruz, Ana Maria",
    );
  });

  it("cuts one that does not, and the result really fits", () => {
    const long = "Bartolome-Villanueva, Maria Concepcion Auxiliadora";
    const cut = truncate(long, "Helvetica", 9, 120);
    expect(cut).not.toBe(long);
    expect(cut.endsWith("…")).toBe(true);
    expect(textWidth(cut, "Helvetica", 9)).toBeLessThanOrEqual(120);
  });

  it("measures Courier as the monospace it is", () => {
    expect(textWidth("0000 0000 0000 0000", "Courier", 9)).toBeCloseTo(
      19 * 0.6 * 9,
    );
  });
});

describe("parent card roster", () => {
  const entries = [
    { guardian_name: "Cruz, Ana", card_number: "4539578763621486" },
    { guardian_name: "Reyes, Ben", card_number: "3782822463100051" },
  ];

  it("builds a readable file with a page per screenful of parents", () => {
    const pdf = decode(
      parentCardRosterPdf({
        schoolName: "Olongapo National High School",
        generatedAt: "2 September 2026 at 9:00 AM",
        entries,
      }),
    );
    expect(pdf).toContain("Parent card print list");
    expect(pdf).toContain("(Cruz, Ana) Tj");
    // Grouped for a human reading it off the sheet, beside the bars.
    expect(pdf).toContain("(4539 5787 6362 1486) Tj");
    expect(pdf).toContain("/Count 1");
  });

  /**
   * The columns a printing press does not need. A contact number and a child
   * count are a family's details, and this file leaves the building.
   */
  it("carries a name, a number and bars — and nothing else about the family", () => {
    const pdf = decode(
      parentCardRosterPdf({
        schoolName: "ONHS",
        generatedAt: "today",
        entries,
      }),
    );
    expect(pdf).not.toContain("Contact");
    expect(pdf).not.toContain("Children");
  });

  it("breaks into more pages rather than running off the bottom of one", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      guardian_name: `Guardian Number ${i}`,
      card_number: "4539578763621486",
    }));
    const pdf = decode(
      parentCardRosterPdf({
        schoolName: "ONHS",
        generatedAt: "today",
        entries: many,
      }),
    );
    const count = Number(/\/Count (\d+)/.exec(pdf)?.[1]);
    expect(count).toBeGreaterThan(1);
    expect(pdf).toContain(`page 1 of ${count}`);
    expect(pdf).toContain(`page ${count} of ${count}`);
  });

  /** A barcode wider than its column would print over the page edge. */
  it("draws a symbol that fits the column reserved for it", () => {
    expect(barcodeWidth("4539578763621486")).toBeLessThan(
      A4.width - MARGIN - COL.barcode,
    );
  });
});
