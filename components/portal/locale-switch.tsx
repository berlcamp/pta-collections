"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Languages } from "lucide-react";

import { setPortalLocale } from "@/app/actions/portal";
import { LOCALE_LABELS } from "@/lib/portal/i18n";
import { cn } from "@/lib/utils";
import type { PortalLocale } from "@/types/database.types";

/**
 * English / Tagalog, as a pill on the blue hero.
 *
 * Two variants because the switch has to work before there is a session: on the
 * sign-in page the locale is a query string, and everywhere else it is a column
 * on portal_accounts carried in the session token.
 */
const pill =
  "inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-white/12 px-3.5 text-sm font-medium text-white ring-1 ring-white/20 transition-colors hover:bg-white/20 active:bg-white/25 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white";

export function LocaleSwitch({
  locale,
  variant = "button",
  className,
}: {
  locale: PortalLocale;
  variant?: "button" | "link";
  className?: string;
}) {
  const next: PortalLocale = locale === "en" ? "tl" : "en";
  const [pending, startTransition] = useTransition();
  // The language it switches TO, in that language's own short form: a parent
  // who cannot read English still recognises "TL".
  const label = next === "tl" ? "TL" : "EN";

  if (variant === "link") {
    return (
      <Link
        href={next === "tl" ? "/portal/login?lang=tl" : "/portal/login"}
        className={cn(pill, className)}
        aria-label={LOCALE_LABELS[next]}
      >
        <Languages className="size-4" />
        {LOCALE_LABELS[next]}
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => setPortalLocale(next))}
      className={cn(pill, className)}
      aria-label={LOCALE_LABELS[next]}
    >
      <Languages className="size-4" />
      {label}
    </button>
  );
}
