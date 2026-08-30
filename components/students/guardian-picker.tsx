"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Search, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import { findGuardians } from "@/app/actions/students";
import type { GuardianSearchResult } from "@/lib/data/guardians";

/**
 * Search-and-link control for the one guardian a student gets.
 *
 * Siblings share a parent, so the parent must be findable rather than retyped:
 * retyping is what fragments a family's contact details across records. The
 * search runs on the server — guardians are a school-wide table, not a list the
 * browser should hold.
 */
export function GuardianPicker({
  onSelect,
  disabled,
}: {
  onSelect: (guardian: GuardianSearchResult) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [rows, setRows] = useState<GuardianSearchResult[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    // Debounced: a keystroke per round trip would make the list flicker
    // backwards as older responses land.
    const timer = setTimeout(() => {
      startTransition(async () => {
        const res = await findGuardians(term);
        if (res.ok) setRows(res.data);
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [open, term]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
        >
          <Search className="size-4" />
          Link existing guardian
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(24rem,calc(100vw-2rem))] p-0"
      >
        {/* The server already filtered; cmdk must not filter again. */}
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search name or contact number…"
            value={term}
            onValueChange={setTerm}
          />
          <CommandList>
            {pending && rows.length === 0 ? (
              <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Searching…
              </div>
            ) : (
              <CommandEmpty>
                No guardian on file matches that search.
              </CommandEmpty>
            )}

            {rows.length > 0 && (
              <CommandGroup heading="Guardians in this school">
                {rows.map((g) => (
                  <CommandItem
                    key={g.id}
                    value={g.id}
                    onSelect={() => {
                      onSelect(g);
                      setOpen(false);
                      setTerm("");
                    }}
                  >
                    <UserRound className="size-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">
                      <span className="font-medium">
                        {g.first_name} {g.last_name}
                      </span>
                      {g.contact_number && (
                        <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                          {g.contact_number}
                        </span>
                      )}
                    </span>
                    {g.student_count > 0 && (
                      <Badge variant="secondary" className="shrink-0">
                        {g.student_count}{" "}
                        {g.student_count === 1 ? "student" : "students"}
                      </Badge>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
