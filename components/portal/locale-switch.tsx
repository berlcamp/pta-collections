"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Languages } from "lucide-react";

import { setPortalLocale } from "@/app/actions/portal";
import { Button } from "@/components/ui/button";
import { LOCALE_LABELS } from "@/lib/portal/i18n";
import type { PortalLocale } from "@/types/database.types";

/**
 * English / Tagalog.
 *
 * Two variants because the switch has to work before there is a session: on the
 * sign-in page the locale is a query string, and everywhere else it is a column
 * on portal_accounts carried in the session token.
 */
export function LocaleSwitch({
  locale,
  variant = "button",
}: {
  locale: PortalLocale;
  variant?: "button" | "link";
}) {
  const next: PortalLocale = locale === "en" ? "tl" : "en";
  const [pending, startTransition] = useTransition();

  if (variant === "link") {
    return (
      <Button asChild variant="ghost" size="sm" className="text-xs">
        <Link href={next === "tl" ? "/portal/login?lang=tl" : "/portal/login"}>
          <Languages className="mr-1.5 size-3.5" />
          {LOCALE_LABELS[next]}
        </Link>
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => setPortalLocale(next))}
      className="text-xs"
    >
      <Languages className="mr-1.5 size-3.5" />
      {LOCALE_LABELS[next]}
    </Button>
  );
}
