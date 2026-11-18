"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { t } from "@/lib/portal/i18n";
import type { PortalLocale } from "@/types/database.types";

/**
 * The school's GCash number, with a Copy button.
 *
 * The parent is about to switch to the GCash app and type this in. Copying it
 * saves them reading eleven digits across two apps — and a mistyped number is
 * money sent to a stranger, which no claim review can recover.
 */
export function GcashNumber({
  number,
  locale,
}: {
  number: string;
  locale: PortalLocale;
}) {
  const copy = t(locale);
  const [copied, setCopied] = useState(false);

  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(number.replace(/\s+/g, ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refused (an old browser, or no permission). The number is
      // on screen in large type; reading it is the fallback.
    }
  }

  return (
    <div className="rounded-2xl bg-blue-50 p-4 ring-1 ring-blue-100">
      <p className="text-xs font-medium text-blue-800">{copy.gcashTo}</p>
      <div className="mt-1.5 flex items-center gap-3">
        <p className="min-w-0 flex-1 font-mono text-xl font-semibold tracking-wide text-slate-900">
          {number}
        </p>
        <button
          type="button"
          onClick={copyNumber}
          className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-white px-4 text-sm font-medium text-blue-700 ring-1 ring-blue-200 transition-colors hover:bg-blue-100 active:bg-blue-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          <span aria-live="polite">{copied ? copy.copied : copy.copy}</span>
        </button>
      </div>
    </div>
  );
}
