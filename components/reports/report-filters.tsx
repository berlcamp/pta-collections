"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { dynamicRoute } from "@/lib/routes";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FeeType, SchoolYear } from "@/types/database.types";

const ALL = "__all__";

export function ReportFilters({
  schoolYears,
  currentYearId,
  feeTypes,
  cashiers,
  show = {},
}: {
  schoolYears: SchoolYear[];
  currentYearId: string;
  feeTypes?: FeeType[];
  cashiers?: { id: string; full_name: string }[];
  show?: {
    dateRange?: boolean;
    feeType?: boolean;
    cashier?: boolean;
    method?: boolean;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === ALL) next.delete(key);
    else next.set(key, value);
    router.push(dynamicRoute(`${pathname}?${next.toString()}`));
  }

  const hasFilters = ["from", "to", "fee", "cashier", "method"].some((k) =>
    params.get(k),
  );

  return (
    <div className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border p-3">
      <div>
        <Label className="text-xs">School year</Label>
        <Select value={currentYearId} onValueChange={(v) => set("sy", v)}>
          <SelectTrigger className="mt-1 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {schoolYears.map((y) => (
              <SelectItem key={y.id} value={y.id}>
                {y.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {show.dateRange !== false && (
        <>
          <div>
            <Label className="text-xs">From</Label>
            <Input
              type="date"
              value={params.get("from") ?? ""}
              onChange={(e) => set("from", e.target.value)}
              className="mt-1 w-40"
            />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input
              type="date"
              value={params.get("to") ?? ""}
              onChange={(e) => set("to", e.target.value)}
              className="mt-1 w-40"
            />
          </div>
        </>
      )}

      {show.feeType && feeTypes && (
        <div>
          <Label className="text-xs">Fee type</Label>
          <Select value={params.get("fee") ?? ALL} onValueChange={(v) => set("fee", v)}>
            <SelectTrigger className="mt-1 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All fee types</SelectItem>
              {feeTypes.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {show.cashier && cashiers && (
        <div>
          <Label className="text-xs">Cashier</Label>
          <Select
            value={params.get("cashier") ?? ALL}
            onValueChange={(v) => set("cashier", v)}
          >
            <SelectTrigger className="mt-1 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All cashiers</SelectItem>
              {cashiers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {show.method && (
        <div>
          <Label className="text-xs">Method</Label>
          <Select
            value={params.get("method") ?? ALL}
            onValueChange={(v) => set("method", v)}
          >
            <SelectTrigger className="mt-1 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All methods</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="gcash">GCash</SelectItem>
              <SelectItem value="bank_transfer">Bank transfer</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(dynamicRoute(`${pathname}?sy=${currentYearId}`))}
        >
          Clear
        </Button>
      )}
    </div>
  );
}
