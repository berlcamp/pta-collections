"use client";

import { useTransition } from "react";
import { Loader2, LogOut } from "lucide-react";

import { portalSignOut } from "@/app/actions/portal-auth";
import { heroIconButton } from "@/components/portal/styles";
import { t } from "@/lib/portal/i18n";
import type { PortalLocale } from "@/types/database.types";

export function SignOutButton({ locale }: { locale: PortalLocale }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      aria-label={t(locale).signOut}
      title={t(locale).signOut}
      disabled={pending}
      onClick={() => startTransition(() => portalSignOut())}
      className={heroIconButton}
    >
      {pending ? (
        <Loader2 className="size-5 animate-spin" />
      ) : (
        <LogOut className="size-5" />
      )}
    </button>
  );
}
