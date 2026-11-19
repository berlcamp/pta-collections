"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CalendarCheck, FileBarChart } from "lucide-react";
import { dynamicRoute } from "@/lib/routes";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/teacher", label: "Today", icon: CalendarCheck },
  { href: "/teacher/report", label: "Report", icon: FileBarChart },
] as const;

/** The cashier desk's pill tabs, carrying the chosen section between pages. */
export function TeacherNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const section = params.get("section");

  return (
    <nav
      aria-label="Teacher"
      className="order-last flex w-full gap-1.5 overflow-x-auto rounded-full bg-white/10 p-1 ring-1 ring-white/15 sm:order-none sm:w-auto"
    >
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={dynamicRoute(section ? `${item.href}?section=${section}` : item.href)}
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
          </Link>
        );
      })}
    </nav>
  );
}
