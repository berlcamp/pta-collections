"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileBarChart, Smartphone, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/cashier", label: "Collect", icon: Wallet },
  { href: "/cashier/online", label: "Online payments", icon: Smartphone },
  { href: "/cashier/report", label: "Report", icon: FileBarChart },
] as const;

/** Pills on the blue bar: the active one is white, like a selected tab in a banking app. */
export function CashierNav({ pendingClaims }: { pendingClaims: number }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Cashier"
      className="order-last flex w-full gap-1.5 overflow-x-auto rounded-full bg-white/10 p-1 ring-1 ring-white/15 sm:order-none sm:w-auto"
    >
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        const count = item.href === "/cashier/online" ? pendingClaims : 0;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
              "focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none",
              active
                ? "bg-white text-blue-800 shadow-md shadow-blue-950/20"
                : "text-blue-50 hover:bg-white/15",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {item.label}
            {count > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs font-semibold tabular-nums",
                  active ? "portal-cta text-white" : "bg-amber-400 text-amber-950",
                )}
              >
                {count}
                <span className="sr-only"> waiting</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
