import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  DerivedPaymentStatus,
  PaymentStatus,
  StudentStatus,
} from "@/types/database.types";

/**
 * Every status carries a dot as well as a hue: a cashier printing a run on a
 * greyscale office laser, or reading it with a colour-vision deficiency, still
 * gets the distinction from the label. Colour is the accent, never the signal.
 */
const CHARGE_STYLES: Record<
  DerivedPaymentStatus,
  { label: string; className: string; dot: string }
> = {
  unpaid: {
    label: "Unpaid",
    className: "border-destructive/25 bg-destructive/10 text-destructive",
    dot: "bg-destructive",
  },
  partially_paid: {
    label: "Partial",
    className: "border-warning/30 bg-warning/15 text-warning",
    dot: "bg-warning",
  },
  paid: {
    label: "Paid",
    className: "border-success/25 bg-success/10 text-success",
    dot: "bg-success",
  },
  waived: {
    label: "Waived",
    className: "border-primary/25 bg-primary/10 text-primary",
    dot: "bg-primary",
  },
  cancelled: {
    label: "Cancelled",
    className: "border-border bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
  },
};

function Dot({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={cn("size-1.5 shrink-0 rounded-full", className)}
    />
  );
}

export function ChargeStatusBadge({ status }: { status: DerivedPaymentStatus }) {
  const s = CHARGE_STYLES[status] ?? CHARGE_STYLES.unpaid;
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium", s.className)}>
      <Dot className={s.dot} />
      {s.label}
    </Badge>
  );
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return status === "voided" ? (
    <Badge
      variant="outline"
      className="gap-1.5 border-destructive/25 bg-destructive/10 font-medium text-destructive"
    >
      <Dot className="bg-destructive" />
      Voided
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="gap-1.5 border-success/25 bg-success/10 font-medium text-success"
    >
      <Dot className="bg-success" />
      Posted
    </Badge>
  );
}

const STUDENT_LABELS: Record<StudentStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  graduated: "Graduated",
  transferred_out: "Transferred out",
};

export function StudentStatusBadge({ status }: { status: StudentStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 font-medium",
        status === "active"
          ? "border-success/25 bg-success/10 text-success"
          : "border-border bg-muted text-muted-foreground",
      )}
    >
      <Dot className={status === "active" ? "bg-success" : "bg-muted-foreground"} />
      {STUDENT_LABELS[status]}
    </Badge>
  );
}
