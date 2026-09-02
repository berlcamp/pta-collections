import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TONES = {
  default: {
    value: "text-foreground",
    icon: "bg-muted text-muted-foreground",
  },
  primary: {
    value: "text-foreground",
    icon: "bg-primary/10 text-primary",
  },
  positive: {
    value: "text-success",
    icon: "bg-success/10 text-success",
  },
  warning: {
    value: "text-warning",
    icon: "bg-warning/15 text-warning",
  },
  negative: {
    value: "text-destructive",
    icon: "bg-destructive/10 text-destructive",
  },
} as const;

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  /** A single control belonging to this figure — clearing the queue it counts,
   *  say. It sits opposite the label rather than under the value, so it never
   *  gets between the number and the hint that qualifies it. */
  action,
  className,
}: {
  label: string;
  value: string | number;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: keyof typeof TONES;
  action?: React.ReactNode;
  className?: string;
}) {
  const t = TONES[tone];

  return (
    <Card className={cn("transition-shadow hover:shadow-sm", className)}>
      <CardContent className="flex items-start gap-3">
        {Icon && (
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-lg",
              t.icon,
            )}
          >
            <Icon className="size-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 truncate text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {label}
            </p>
            {action}
          </div>
          <p
            className={cn(
              "mt-1 font-mono text-2xl leading-tight font-semibold tabular-nums",
              t.value,
            )}
          >
            {value}
          </p>
          {hint && (
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
