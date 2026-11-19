"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { dynamicRoute } from "@/lib/routes";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "__all__";

/**
 * Grade and section for Reports → Attendance. Both live in the URL (?grade=,
 * ?section=) like every other report filter, so the CSV export carries them.
 * Picking a grade drops a section from another grade; picking a section sets
 * its grade, since a section belongs to exactly one.
 */
export function AttendanceScopeFilter({
  grades,
  sections,
}: {
  grades: { code: string; label: string }[];
  sections: { id: string; name: string; grade_level: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const grade = params.get("grade") ?? "";
  const section = params.get("section") ?? "";

  function go(next: URLSearchParams) {
    router.push(dynamicRoute(`${pathname}?${next.toString()}`));
  }

  function setGrade(v: string) {
    const next = new URLSearchParams(params.toString());
    if (v === ALL) next.delete("grade");
    else next.set("grade", v);
    const s = sections.find((x) => x.id === section);
    if (s && v !== ALL && s.grade_level !== v) next.delete("section");
    go(next);
  }

  function setSection(v: string) {
    const next = new URLSearchParams(params.toString());
    if (v === ALL) next.delete("section");
    else {
      next.set("section", v);
      const s = sections.find((x) => x.id === v);
      if (s) next.set("grade", s.grade_level);
    }
    go(next);
  }

  const visible = grade ? sections.filter((s) => s.grade_level === grade) : sections;

  return (
    <div className="-mt-3 mb-6 flex flex-wrap items-end gap-3 rounded-lg border p-3">
      <div>
        <Label className="text-xs">Grade level</Label>
        <Select value={grade || ALL} onValueChange={setGrade}>
          <SelectTrigger className="mt-1 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All grades</SelectItem>
            {grades.map((g) => (
              <SelectItem key={g.code} value={g.code}>
                {g.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Section</Label>
        <Select value={section || ALL} onValueChange={setSection}>
          <SelectTrigger className="mt-1 w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All sections</SelectItem>
            {visible.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {grade ? s.name : `${s.grade_level} · ${s.name}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
