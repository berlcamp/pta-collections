"use client";

import { Fragment } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

import { dynamicRoute } from "@/lib/routes";
import { childFor, moduleFor, type NavGroup } from "@/lib/nav";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

/** Turns `/charges/fees` into `Charges › Fee types`. */
function crumbsFor(pathname: string, groups: NavGroup[]) {
  const mod = moduleFor(pathname, groups);
  if (!mod) return [];

  const child = childFor(pathname, mod);
  const crumbs: { label: string; href?: string }[] = [
    { label: mod.label, href: pathname === mod.href ? undefined : mod.href },
  ];
  if (child && child.href !== mod.href) {
    crumbs.push({
      label: child.label,
      href: pathname === child.href ? undefined : child.href,
    });
  }

  // A detail route (/students/<id>) gets a trailing, unlinked crumb so the
  // header still reads as a location rather than jumping back a level.
  const base = child?.href ?? mod.href;
  if (pathname !== base) {
    const tail = pathname.slice(base.length).split("/").filter(Boolean);
    if (tail.length) {
      const last = tail[tail.length - 1];
      crumbs.push({
        label: /^[0-9a-f-]{20,}$/i.test(last)
          ? "Details"
          : last.charAt(0).toUpperCase() + last.slice(1).replace(/-/g, " "),
      });
    }
  }

  return crumbs;
}

export function AppBreadcrumbs({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const crumbs = crumbsFor(pathname, groups);

  if (crumbs.length === 0) return null;

  return (
    <Breadcrumb className="hidden min-w-0 md:block">
      <BreadcrumbList>
        {crumbs.map((c, i) => (
          // The separator is a sibling `<li>`, never a child of the item —
          // nesting one inside the other is invalid HTML and React rejects it
          // as a hydration mismatch.
          <Fragment key={`${c.label}-${i}`}>
            <BreadcrumbItem>
              {c.href ? (
                <BreadcrumbLink asChild>
                  <Link href={dynamicRoute(c.href)}>{c.label}</Link>
                </BreadcrumbLink>
              ) : i === crumbs.length - 1 ? (
                <BreadcrumbPage className="truncate">{c.label}</BreadcrumbPage>
              ) : (
                <span className="text-muted-foreground">{c.label}</span>
              )}
            </BreadcrumbItem>
            {i < crumbs.length - 1 && <BreadcrumbSeparator />}
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
