"use client";

import { useState, useTransition } from "react";
import { Building2, Check, ChevronsUpDown, Loader2 } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { switchSchool } from "@/app/actions/school-context";
import { cn } from "@/lib/utils";

/**
 * The school switcher for the cashier desk and the teacher workspace — the
 * two places a person is sent and KEPT, so the main app's switcher is out of
 * their reach. Someone who is a cashier at one school and a teacher at another
 * would otherwise be stuck in whichever school loaded first.
 *
 * Rendered only for people with more than one school. Switching goes through
 * switchSchool(), which re-checks the membership and lands on /dashboard,
 * where app/(app)/layout.tsx sends them to the right workspace for their role
 * in the new school.
 */
export function WorkspaceSchoolSwitcher({
  current,
  schools,
}: {
  current: string;
  schools: { id: string; name: string; role: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (schools.length < 2) return null;
  const active = schools.find((s) => s.id === current);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={pending}
          aria-label="Switch school"
          className="inline-flex h-11 max-w-[14rem] items-center gap-2 rounded-full bg-white/12 px-4 text-sm font-medium text-white ring-1 ring-white/20 transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
        >
          {pending ? (
            <Loader2 className="size-4 shrink-0 animate-spin" />
          ) : (
            <Building2 className="size-4 shrink-0" />
          )}
          <span className="truncate">{active?.name ?? "School"}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-1.5">
        <p className="px-2.5 pt-1.5 pb-2 text-xs font-medium text-muted-foreground">
          Your schools
        </p>
        <ul>
          {schools.map((s) => {
            const isCurrent = s.id === current;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={isCurrent || pending}
                  onClick={() => {
                    setOpen(false);
                    startTransition(() => void switchSchool(s.id));
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                    isCurrent ? "bg-muted" : "hover:bg-muted/60",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{s.name}</span>
                    <span className="block text-xs text-muted-foreground">{s.role}</span>
                  </span>
                  {isCurrent && <Check className="size-4 shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
