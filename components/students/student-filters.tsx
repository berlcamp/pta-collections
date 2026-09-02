"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";

import { dynamicRoute } from "@/lib/routes";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "__all__";

/**
 * Server-side filters for the student roll.
 *
 * These drive the query, not the rendered page — a school with 4,000 students
 * ships 50 rows at a time, so filtering in the table component would only ever
 * search the page in front of you. The search debounces so a cashier typing a
 * surname does not fire eight queries.
 */
export function StudentFilters({ gradeLevels }: { gradeLevels: string[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const urlQuery = params.get("q") ?? "";
  const grade = params.get("grade") ?? ALL;
  const [value, setValue] = useState(urlQuery);

  // Keep the box in step when the URL changes underneath us — the back button,
  // or the Clear control below. Adjusted during render rather than from an
  // effect: an effect would paint the stale term first, then correct it.
  const [syncedQuery, setSyncedQuery] = useState(urlQuery);
  if (syncedQuery !== urlQuery) {
    setSyncedQuery(urlQuery);
    setValue(urlQuery);
  }

  function push(mutate: (p: URLSearchParams) => void) {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    next.delete("page"); // a new filter always restarts at page 1
    startTransition(() => {
      router.push(dynamicRoute(`/students?${next.toString()}`));
    });
  }

  useEffect(() => {
    if (value === urlQuery) return;
    const t = setTimeout(() => {
      push((p) => {
        if (value.trim()) p.set("q", value.trim());
        else p.delete("q");
      });
    }, 350);
    return () => clearTimeout(t);
    // `push` closes over the current params on purpose; re-creating the timer
    // on every param change would cancel an in-flight debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, urlQuery]);

  const isFiltered = Boolean(urlQuery) || grade !== ALL;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-80">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search student, parent, LRN or student number…"
          className="pl-9"
          aria-label="Search students"
        />
        {pending && (
          <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      <Select
        value={grade}
        onValueChange={(v) =>
          push((p) => (v === ALL ? p.delete("grade") : p.set("grade", v)))
        }
      >
        <SelectTrigger className="min-w-[10rem]">
          <SelectValue placeholder="All grades" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All grades</SelectItem>
          {gradeLevels.map((g) => (
            <SelectItem key={g} value={g}>
              {g}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isFiltered && (
        <Button
          variant="ghost"
          onClick={() =>
            push((p) => {
              p.delete("q");
              p.delete("grade");
            })
          }
        >
          <X className="size-3.5" />
          Clear
        </Button>
      )}
    </div>
  );
}
