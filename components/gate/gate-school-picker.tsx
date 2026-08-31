"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Building2 } from "lucide-react";

import { dynamicRoute } from "@/lib/routes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { School } from "@/types/database.types";

/**
 * Which school's gate you are looking at.
 *
 * A super admin lands here with no active school, and the header switcher is
 * for entering a school to work inside it — a heavier action than glancing at
 * another gate. So this scopes the page only, on `?school=`, and leaves the
 * rest of the session alone.
 */
export function GateSchoolPicker({
  schools,
  selected,
}: {
  schools: School[];
  selected: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function pick(id: string) {
    const next = new URLSearchParams(params);
    next.set("school", id);
    // Any date filter belongs to the school it was chosen in; carrying a date
    // across is harmless, carrying a card uid is not.
    next.delete("card");
    router.push(dynamicRoute(`${pathname}?${next.toString()}`));
  }

  return (
    <Select value={selected} onValueChange={pick}>
      <SelectTrigger className="w-full sm:w-64">
        <Building2 className="size-4 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {schools.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
