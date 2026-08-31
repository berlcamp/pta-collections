"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";
import type { PortalChild } from "@/types/database.types";

/** A pill row, not a <select>: two or three children fit, and one tap beats two. */
export function ChildFilter({
  students,
  selected,
  basePath,
}: {
  students: PortalChild[];
  selected?: string;
  basePath: string;
}) {
  if (students.length < 2) return null;

  const pill = (active: boolean) =>
    cn(
      "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-input bg-background hover:bg-accent",
    );

  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      <Link href={{ pathname: basePath }} className={pill(!selected)}>
        All
      </Link>
      {students.map((child) => (
        <Link
          key={child.student_id}
          href={{ pathname: basePath, query: { student: child.student_id } }}
          className={pill(selected === child.student_id)}
        >
          {child.full_name.split(",")[1]?.trim() ?? child.full_name}
        </Link>
      ))}
    </div>
  );
}
