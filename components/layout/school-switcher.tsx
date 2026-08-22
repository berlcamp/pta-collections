"use client";

import { useState, useTransition } from "react";
import { Building2, Check, ChevronsUpDown, Globe, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { SessionContext } from "@/lib/auth/session";
import type { School } from "@/types/database.types";
import { switchSchool, exitSchool } from "@/app/actions/school-context";

export function SchoolSwitcher({
  session,
  allSchools,
}: {
  session: SessionContext;
  allSchools?: School[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const { activeSchool, isSuperAdmin, memberships } = session;

  const schools: School[] = isSuperAdmin
    ? (allSchools ?? memberships.map((m) => m.school))
    : memberships.map((m) => m.school);

  // A normal user with exactly one school gets a label, not a control.
  if (!isSuperAdmin && schools.length <= 1) {
    return (
      <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
        <Building2 className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{activeSchool?.name ?? "No school"}</span>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="max-w-[14rem] justify-between gap-2 sm:max-w-xs"
          disabled={pending}
        >
          {pending ? (
            <Loader2 className="size-4 shrink-0 animate-spin" />
          ) : activeSchool ? (
            <Building2 className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <Globe className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">
            {activeSchool?.name ?? "Global administration"}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <Command>
          <CommandInput placeholder="Search schools…" />
          <CommandList>
            <CommandEmpty>No schools match that search.</CommandEmpty>

            {isSuperAdmin && (
              <CommandGroup heading="Global">
                <CommandItem
                  value="global administration"
                  onSelect={() => {
                    setOpen(false);
                    startTransition(() => void exitSchool());
                  }}
                >
                  <Globe className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">Global administration</span>
                  <Check
                    className={cn(
                      "size-4",
                      activeSchool ? "opacity-0" : "opacity-100",
                    )}
                  />
                </CommandItem>
              </CommandGroup>
            )}

            <CommandGroup heading="Schools">
              {schools.map((school) => (
                <CommandItem
                  key={school.id}
                  value={`${school.name} ${school.school_code}`}
                  onSelect={() => {
                    setOpen(false);
                    startTransition(() => void switchSchool(school.id));
                  }}
                >
                  <Building2 className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">
                    {school.name}
                    <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                      {school.school_code}
                    </span>
                  </span>
                  <Check
                    className={cn(
                      "size-4",
                      activeSchool?.id === school.id
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
