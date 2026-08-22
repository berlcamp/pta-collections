import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/financial/money";

export function MoneyDisplay({
  amount,
  className,
  muted,
  emphasis,
}: {
  amount: number | string | null | undefined;
  className?: string;
  muted?: boolean;
  emphasis?: boolean;
}) {
  return (
    <span
      className={cn(
        "font-mono tabular-nums whitespace-nowrap",
        muted && "text-muted-foreground",
        emphasis && "font-semibold",
        className,
      )}
    >
      {formatMoney(amount)}
    </span>
  );
}
