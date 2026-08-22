"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";

import { dynamicRoute } from "@/lib/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Searches every receipt in the school year, not just the page on screen —
 * which is why this lives here and not in the table's own toolbar.
 */
export function PaymentSearchBar() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const urlQuery = params.get("q") ?? "";
  const [value, setValue] = useState(urlQuery);

  // Adjusted during render, not from an effect: an effect would paint the stale
  // term for a frame before correcting it.
  const [syncedQuery, setSyncedQuery] = useState(urlQuery);
  if (syncedQuery !== urlQuery) {
    setSyncedQuery(urlQuery);
    setValue(urlQuery);
  }

  function push(term: string) {
    const next = new URLSearchParams(params.toString());
    if (term.trim()) next.set("q", term.trim());
    else next.delete("q");
    next.delete("page");
    startTransition(() => {
      router.push(dynamicRoute(`/collections?${next.toString()}`));
    });
  }

  useEffect(() => {
    if (value === urlQuery) return;
    const t = setTimeout(() => push(value), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, urlQuery]);

  return (
    <div className="flex items-center gap-2">
      <div className="relative w-full sm:w-80">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search receipt or reference number…"
          className="pl-9"
          aria-label="Search receipts"
        />
        {pending && (
          <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      {urlQuery && (
        <Button variant="ghost" onClick={() => push("")}>
          <X className="size-3.5" />
          Clear
        </Button>
      )}
    </div>
  );
}
