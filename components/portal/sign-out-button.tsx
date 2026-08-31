"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";

import { portalSignOut } from "@/app/actions/portal-auth";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/portal/i18n";
import type { PortalLocale } from "@/types/database.types";

export function SignOutButton({ locale }: { locale: PortalLocale }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t(locale).signOut}
      disabled={pending}
      onClick={() => startTransition(() => portalSignOut())}
    >
      <LogOut className="size-4" />
    </Button>
  );
}
