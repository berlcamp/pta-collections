"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintNowButton() {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-neutral-100 px-4 py-2 print:hidden">
      <Button size="sm" onClick={() => window.print()}>
        <Printer className="size-4" />
        Print
      </Button>
      <p className="text-xs text-neutral-600">
        Use your browser&rsquo;s print dialog to save as PDF.
      </p>
    </div>
  );
}
