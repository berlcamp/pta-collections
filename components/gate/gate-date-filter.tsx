"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { dynamicRoute } from "@/lib/routes";
import { Input } from "@/components/ui/input";

/** Which day's gate activity to show. Same URL-driven shape as the collections
 *  date filter, so both pages behave identically under Back. */
export function GateDateFilter({ date, max }: { date: string; max: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <Input
      type="date"
      value={date}
      max={max}
      aria-label="Date"
      className="w-40"
      onChange={(e) => {
        const next = new URLSearchParams(params);
        next.set("date", e.target.value);
        router.push(dynamicRoute(`${pathname}?${next.toString()}`));
      }}
    />
  );
}
