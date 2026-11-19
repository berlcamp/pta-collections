import Link from "next/link";
import { dynamicRoute } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { TeacherSection } from "@/lib/data/teacher";

/** Pills for a teacher with more than one section; nothing for one. */
export function SectionSwitcher({
  sections,
  current,
  basePath,
  keep = {},
}: {
  sections: TeacherSection[];
  current: string;
  basePath: "/teacher" | "/teacher/report";
  /** Other params to carry across (the date, the range). */
  keep?: Record<string, string | undefined>;
}) {
  if (sections.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {sections.map((s) => {
        const qs = new URLSearchParams({ section: s.section_id });
        for (const [k, v] of Object.entries(keep)) if (v) qs.set(k, v);
        const active = s.section_id === current;
        return (
          <Link
            key={s.section_id}
            href={dynamicRoute(`${basePath}?${qs.toString()}`)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium ring-1 transition-colors",
              active
                ? "portal-cta text-white ring-transparent"
                : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50",
            )}
          >
            {s.grade_level} · {s.section_name}
            {!s.is_active_year && (
              <span className="ml-1 text-xs opacity-75">({s.school_year_name})</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
