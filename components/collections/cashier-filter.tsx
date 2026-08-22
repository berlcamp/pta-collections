"use client";

import { useRouter } from "next/navigation";
import { dynamicRoute } from "@/lib/routes";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CashierFilter({
  cashiers,
  selected,
  date,
  lockedToSelf,
}: {
  cashiers: { id: string; full_name: string }[];
  selected: string;
  date: string;
  /** A cashier's own profile id — they can still view all, but default to self. */
  lockedToSelf: string | null;
}) {
  const router = useRouter();

  function push(next: { date?: string; cashier?: string }) {
    const params = new URLSearchParams();
    params.set("date", next.date ?? date);
    params.set("cashier", next.cashier ?? selected);
    router.push(dynamicRoute(`/collections/today?${params.toString()}`));
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Input
        type="date"
        value={date}
        onChange={(e) => push({ date: e.target.value })}
        className="w-40"
      />
      <Select value={selected} onValueChange={(v) => push({ cashier: v })}>
        <SelectTrigger className="w-52">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All cashiers</SelectItem>
          {cashiers.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.full_name}
              {c.id === lockedToSelf ? " (you)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
