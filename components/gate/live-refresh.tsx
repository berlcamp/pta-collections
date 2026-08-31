"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Keeps the board current by re-running the SERVER component on an interval,
 * rather than opening a realtime subscription.
 *
 * Realtime would mean adding pta.attendance to a publication, and the Postgres
 * publication is database-wide on a project shared with two other apps — not a
 * change this app gets to make on its own. Polling a force-dynamic page costs
 * two indexed queries every few seconds and keeps every read inside the
 * RLS-bound client, which is the rule that matters.
 *
 * The interval is a choice, not a constant: 10s during the morning rush, off
 * entirely when someone leaves the page open on a projector all day.
 */
const INTERVALS = [
  { value: "10", label: "Every 10s" },
  { value: "30", label: "Every 30s" },
  { value: "60", label: "Every minute" },
  { value: "0", label: "Paused" },
];

export function LiveRefresh({ defaultSeconds = 15 }: { defaultSeconds?: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [seconds, setSeconds] = useState(String(defaultSeconds));
  const [since, setSince] = useState(0);

  const every = Number(seconds);

  useEffect(() => {
    // A ticking "12s ago" is what tells a reader the board is alive when the
    // gate itself is quiet — an unchanging screen looks identical to a crash.
    const tick = setInterval(() => setSince((s) => s + 1), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (every <= 0) return;
    const timer = setInterval(() => {
      startTransition(() => {
        router.refresh();
        setSince(0);
      });
    }, every * 1000);
    return () => clearInterval(timer);
  }, [every, router]);

  return (
    <div className="flex items-center gap-2">
      <span
        className="hidden text-xs text-muted-foreground tabular-nums sm:inline"
        aria-live="off"
      >
        updated {since}s ago
      </span>
      <Select value={seconds} onValueChange={setSeconds}>
        <SelectTrigger className="w-36" aria-label="Refresh interval">
          {every > 0 ? (
            <Play className="size-3.5 text-success" />
          ) : (
            <Pause className="size-3.5 text-muted-foreground" />
          )}
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {INTERVALS.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="icon"
        aria-label="Refresh now"
        onClick={() =>
          startTransition(() => {
            router.refresh();
            setSince(0);
          })
        }
      >
        <RefreshCw className={cn("size-4", pending && "animate-spin")} />
      </Button>
    </div>
  );
}
