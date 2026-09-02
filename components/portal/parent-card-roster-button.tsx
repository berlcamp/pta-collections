"use client";

import { useState, useTransition } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { parentCardRoster } from "@/app/actions/parent-cards";
import { Button } from "@/components/ui/button";
import { parentCardRosterPdf } from "@/lib/pdf/parent-card-roster";

/**
 * Download the printing press sheet.
 *
 * A file, not a screen. This document is emailed to a press rather than read
 * here, and a print dialog cannot produce a file without a human choosing "Save
 * as PDF" and getting the scale right — at 90% the bars narrow and a scanner
 * starts refusing them. So the PDF is built outright, in this browser, from
 * lib/pdf.
 *
 * Nothing is rendered on the way past. The numbers arrive from the server
 * action, go straight into the file, and leave in a blob URL that is revoked on
 * the next line; they are never put on screen, never in the DOM, and never in a
 * page this tab could be navigated back to.
 */
export function ParentCardRosterButton({
  schoolId,
  schoolCode,
  disabled,
}: {
  schoolId: string;
  /** Only used to name the file, so a press gets an obvious attachment. */
  schoolCode: string;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const download = () => {
    setBusy(true);
    startTransition(async () => {
      const result = await parentCardRoster(schoolId);
      if (!result.ok) {
        setBusy(false);
        toast.error(result.error);
        return;
      }

      const { schoolName, generatedAt, entries } = result.data;
      if (entries.length === 0) {
        setBusy(false);
        toast.error("There are no active parent cards at this school yet.");
        return;
      }

      const bytes = parentCardRosterPdf({ schoolName, generatedAt, entries });
      const url = URL.createObjectURL(
        new Blob([bytes as BlobPart], { type: "application/pdf" }),
      );

      const link = document.createElement("a");
      link.href = url;
      link.download = `parent-cards-${schoolCode.toLowerCase()}-${today()}.pdf`;
      link.click();
      URL.revokeObjectURL(url);

      setBusy(false);
      toast.success(
        `${entries.length.toLocaleString()} card${entries.length === 1 ? "" : "s"} downloaded. The numbers are sign-in credentials — send the file the way you would send a payroll.`,
      );
    });
  };

  const working = busy || pending;

  return (
    <Button variant="outline" onClick={download} disabled={working || disabled}>
      {working ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Download className="size-4" />
      )}
      Download list for the press
    </Button>
  );
}

/** yyyy-mm-dd, for a filename that sorts. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}
