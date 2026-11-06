"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/cashier", label: "Collect" },
  { href: "/cashier/online", label: "Online payments" },
  { href: "/cashier/report", label: "Report" },
] as const;

export function CashierNav({ pendingClaims }: { pendingClaims: number }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Cashier" className="order-last flex w-full gap-1 sm:order-none sm:w-auto">
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        const count = item.href === "/cashier/online" ? pendingClaims : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {item.label}
            {count > 0 && (
              <span className="rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular-nums">
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
