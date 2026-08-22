"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { dynamicRoute } from "@/lib/routes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SchoolYear } from "@/types/database.types";

export function SchoolYearPicker({
  years,
  current,
}: {
  years: SchoolYear[];
  current: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  if (years.length <= 1) return null;

  function onChange(value: string) {
    const next = new URLSearchParams(params.toString());
    next.set("sy", value);
    router.push(dynamicRoute(`${pathname}?${next.toString()}`));
  }

  return (
    <Select value={current} onValueChange={onChange}>
      <SelectTrigger className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {years.map((y) => (
          <SelectItem key={y.id} value={y.id}>
            {y.name}
            {y.is_active ? " (active)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
