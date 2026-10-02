"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";
import { dynamicRoute } from "@/lib/routes";

/**
 * Tabs WITHIN a page, as links on a query parameter.
 *
 * Deliberately not the Radix `Tabs` primitive, and deliberately not local
 * state. Panels here are server-rendered and each one costs its own queries —
 * a student's attendance is a different read from their charges — so the tab
 * has to be part of the request, not something the client toggles after
 * everything has already been fetched.
 *
 * Being in the URL also makes a tab linkable, which the rest of this app
 * assumes: the attendance report links straight at a student's Attendance tab,
 * and the browser's Back button steps between tabs the way a reader expects.
 *
 * Every other search param is preserved, so switching tabs never silently
 * drops the school year the page is being read for.
 *
 * Visually this is components/layout/module-tabs.tsx — the module strip at the
 * top of a section — one level down. Same underline, same active weight, so a
 * second row of tabs reads as a subdivision of the first rather than a
 * competing navigation.
 */
export interface PageTab {
  key: string;
  label: string;
  /** Shown as a muted count beside the label. Omit rather than pass 0 when
   *  zero is not a meaningful answer. */
  count?: number;
}

export function PageTabs({
  tabs,
  active,
  param = "tab",
  className,
}: {
  tabs: PageTab[];
  active: string;
  param?: string;
  className?: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  const hrefFor = (key: string) => {
    const next = new URLSearchParams(params.toString());
    // The first tab is the default, so it is the URL with no parameter at all
    // rather than one that names it.
    if (key === tabs[0]?.key) next.delete(param);
    else next.set(param, key);
    const qs = next.toString();
    return dynamicRoute(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <nav
      aria-label="Sections"
      className={cn("-mx-4 mb-6 overflow-x-auto border-b px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8", className)}
    >
      <ul className="flex min-w-max items-center gap-1">
        {tabs.map((tab) => {
          const isActive = tab.key === active;
          return (
            <li key={tab.key}>
              <Link
                href={hrefFor(tab.key)}
                scroll={false}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
                  isActive
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                {tab.label}
                {tab.count !== undefined && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                    {tab.count.toLocaleString()}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
