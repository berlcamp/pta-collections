"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { dynamicRoute } from "@/lib/routes";
import { childFor, moduleFor, type NavGroup } from "@/lib/nav";

/**
 * Sub-navigation for the module the current path belongs to.
 *
 * These rows used to live in the sidebar, which grew to twenty-one entries.
 * Showing a module's pages only while you are inside that module keeps the
 * rail to one row per module without hiding anything.
 */
export function ModuleTabs({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();

  const mod = moduleFor(pathname, groups);
  const children = mod?.children ?? [];
  // One tab is not a choice — the page header already says where you are.
  if (!mod || children.length < 2) return null;

  const active = childFor(pathname, mod);

  return (
    <nav
      aria-label={`${mod.label} pages`}
      className="-mx-4 mb-6 overflow-x-auto border-b px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8"
    >
      <ul className="flex min-w-max items-center gap-1">
        {children.map((item) => {
          const isActive = active?.href === item.href;
          return (
            <li key={item.href}>
              <Link
                href={dynamicRoute(item.href)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex items-center border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
                  isActive
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
