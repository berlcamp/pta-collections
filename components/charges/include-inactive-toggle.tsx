"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { dynamicRoute } from "@/lib/routes";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function IncludeInactiveToggle({ checked }: { checked: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function onChange(v: boolean) {
    const next = new URLSearchParams(params.toString());
    if (v) next.set("inactive", "1");
    else next.delete("inactive");
    router.push(dynamicRoute(`${pathname}?${next.toString()}`));
  }

  return (
    <div className="flex items-center gap-2 rounded-md border px-3">
      <Switch id="inactive" checked={checked} onCheckedChange={onChange} />
      <Label htmlFor="inactive" className="cursor-pointer py-2 text-xs whitespace-nowrap">
        Include inactive students
      </Label>
    </div>
  );
}
