"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  HandCoins,
  Home,
  Receipt,
  ScanLine,
  Wallet,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { t } from "@/lib/portal/i18n";
import type { PortalLocale } from "@/types/database.types";

/**
 * A bottom tab bar, not a sidebar.
 *
 * Almost every parent opens this on a phone, one-handed, standing up. Six
 * destinations at the thumb, each a 56px target, and the labels stay visible
 * rather than hiding behind icons a first-time user has to decode.
 */
export function PortalNav({ locale }: { locale: PortalLocale }) {
  const copy = t(locale);
  const pathname = usePathname();

  const items = [
    { href: "/portal", label: copy.navHome, icon: Home, exact: true },
    { href: "/portal/attendance", label: copy.navAttendance, icon: ScanLine, exact: false },
    { href: "/portal/balances", label: copy.navBalances, icon: Wallet, exact: false },
    { href: "/portal/give", label: copy.navGive, icon: HandCoins, exact: false },
    { href: "/portal/claims", label: copy.navClaims, icon: Receipt, exact: false },
    { href: "/portal/telegram", label: copy.navTelegram, icon: Bell, exact: false },
  ] as const;

  return (
    <nav
      aria-label="Portal"
      className="sticky bottom-0 z-20 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-6">
        {items.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-5" />
                <span className="max-w-full truncate px-0.5">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
