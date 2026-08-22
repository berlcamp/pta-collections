"use client";

import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Exports are CSV with a UTF-8 BOM so Excel renders ñ and diacritics correctly,
 * and money columns are bare numbers so Excel treats them as numeric (D19).
 */
export function ExportButton({ report }: { report: string }) {
  const params = useSearchParams();
  const href = `/api/export/${report}?${params.toString()}`;

  return (
    <Button variant="outline" size="sm" asChild>
      <a href={href} download>
        <Download className="size-4" />
        Export CSV
      </a>
    </Button>
  );
}
