"use client";

import Link from "next/link";
import { Printer, Smartphone, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * On-screen only: `print:hidden` removes it from the printed page.
 */
export function PrintControls({
  receiptId,
  currentFormat,
}: {
  receiptId: string;
  currentFormat: "a4" | "58mm";
}) {
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-neutral-100 px-4 py-2 print:hidden">
      <Button size="sm" onClick={() => window.print()}>
        <Printer className="size-4" />
        Print
      </Button>

      <Button
        size="sm"
        variant={currentFormat === "a4" ? "secondary" : "outline"}
        asChild
      >
        <Link href={`/print/receipt/${receiptId}`}>
          <FileText className="size-4" />
          A4
        </Link>
      </Button>

      <Button
        size="sm"
        variant={currentFormat === "58mm" ? "secondary" : "outline"}
        asChild
      >
        <Link href={`/print/receipt/${receiptId}?format=58mm`}>
          <Smartphone className="size-4" />
          58mm
        </Link>
      </Button>

      <p className="ml-auto text-xs text-neutral-600">
        Use your browser&rsquo;s print dialog to save as PDF.
      </p>
    </div>
  );
}
