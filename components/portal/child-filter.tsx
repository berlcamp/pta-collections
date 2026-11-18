import Link from "next/link";

import { cn } from "@/lib/utils";
import type { PortalChild, PortalLocale } from "@/types/database.types";

/**
 * A pill row, not a <select>: two or three children fit, and one tap beats two.
 * Hidden for a single child — there is nothing to choose between.
 */
export function ChildFilter({
  students,
  selected,
  basePath,
  locale,
}: {
  students: PortalChild[];
  selected?: string;
  basePath: string;
  locale: PortalLocale;
}) {
  if (students.length < 2) return null;

  const pill = (active: boolean) =>
    cn(
      "inline-flex h-11 shrink-0 items-center rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200",
      active
        ? "portal-cta text-white shadow-md shadow-blue-900/15"
        : "bg-white text-slate-700 ring-1 ring-slate-900/10 hover:bg-slate-50",
    );

  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      <Link
        href={{ pathname: basePath }}
        className={pill(!selected)}
        aria-current={!selected ? "page" : undefined}
      >
        {locale === "tl" ? "Lahat" : "All"}
      </Link>
      {students.map((child) => (
        <Link
          key={child.student_id}
          href={{ pathname: basePath, query: { student: child.student_id } }}
          className={pill(selected === child.student_id)}
          aria-current={selected === child.student_id ? "page" : undefined}
        >
          {child.full_name.split(",")[1]?.trim().split(/\s+/)[0] ?? child.full_name}
        </Link>
      ))}
    </div>
  );
}
