"use client";

import { useMemo, useState } from "react";
import { CircleAlert, CircleCheck, CreditCard, Loader2, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPayment } from "@/app/actions/payments";
import { ConfirmPaymentDialog } from "@/components/collections/confirm-payment-dialog";
import {
  allocationTotal,
  clearAll,
  selectAll,
  setLineAmount,
  toggleLine,
  validateAllocation,
} from "@/lib/financial/allocation";
import {
  formatMoney,
  parseMoneyInput,
  subtractMoney,
  sumMoney,
} from "@/lib/financial/money";
import type { Household } from "@/lib/cashier/lookup";
import {
  planPayments,
  quickTenders,
  tenderedForReceipt,
  type CollectLine,
} from "@/lib/cashier/settlement";
import { formatDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";
import type { PaymentMethod } from "@/types/database.types";

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "gcash", label: "GCash" },
  { value: "bank_transfer", label: "Bank" },
  { value: "other", label: "Other" },
];

export interface IssuedReceipt {
  paymentId: string;
  receiptNumber: string;
  total: number;
  studentName: string;
}

export interface CollectResult {
  payerName: string;
  receipts: IssuedReceipt[];
  total: number;
  /** Null unless cash was counted at the desk. */
  change: number | null;
  /** What the family still owes after this visit. */
  remaining: number;
}

/** One parent, every child, every open charge, and the money coming in. */
export function HouseholdPayment({
  household,
  viaCard,
  onLockChange,
  onCollected,
}: {
  household: Household;
  viaCard: boolean;
  onLockChange: (locked: boolean) => void;
  onCollected: (result: CollectResult) => void;
}) {
  const [lines, setLines] = useState<CollectLine[]>(household.lines);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [tendered, setTendered] = useState("");
  const [reference, setReference] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [issued, setIssued] = useState<IssuedReceipt[]>([]);
  const [failure, setFailure] = useState<string | null>(null);

  /**
   * One key per planned receipt, kept for this visit. create_payment treats a
   * repeated key as the same payment, which is what makes "Try again" safe after
   * a failure partway through a family: receipts already issued come back
   * unchanged instead of being charged twice.
   */
  const [keys] = useState(() => new Map<string, string>());
  const keyFor = (planKey: string) => {
    if (!keys.has(planKey)) keys.set(planKey, crypto.randomUUID());
    return keys.get(planKey)!;
  };

  const total = useMemo(() => allocationTotal(lines), [lines]);
  const familyBalance = useMemo(
    () => sumMoney(lines.map((l) => l.balance)),
    [lines],
  );
  const allSelected = lines.length > 0 && lines.every((l) => l.selected);
  const plan = useMemo(() => planPayments(lines), [lines]);

  const tenderedValue = tendered ? parseMoneyInput(tendered) : null;
  const shortTendered =
    method === "cash" && tenderedValue !== null && tenderedValue < total;
  const change =
    method === "cash" && tenderedValue !== null && tenderedValue >= total && total > 0
      ? subtractMoney(tenderedValue, total)
      : null;

  const validation = validateAllocation(lines);
  const needsReference = method !== "cash" && reference.trim().length === 0;
  const problems = [
    ...validation.errors,
    ...(needsReference ? ["Enter the reference number."] : []),
    ...(shortTendered ? ["Cash received is less than the total."] : []),
  ];

  /** Some receipts exist and some do not. Nothing may change until that is settled. */
  const partial = issued.length > 0 && failure !== null;

  const studentName = (id: string) =>
    household.students.find((s) => s.id === id)?.name ?? "";

  const describeLine = (line: CollectLine) =>
    household.students.length > 1
      ? { ...line, feeTypeName: `${studentName(line.studentId)}: ${line.feeTypeName}` }
      : line;

  function setConfirm(open: boolean) {
    setConfirmOpen(open);
    onLockChange(open);
  }

  function attempt() {
    if (problems.length > 0) {
      setAttempted(true);
      return;
    }
    setConfirm(true);
  }

  async function record() {
    setSubmitting(true);
    setFailure(null);

    const receipts: IssuedReceipt[] = [];

    for (const payment of plan) {
      const result = await createPayment({
        studentId: payment.studentId,
        schoolYearId: payment.schoolYearId,
        paymentMethod: method,
        items: payment.items,
        referenceNumber: reference.trim() || null,
        remarks: null,
        amountTendered:
          method === "cash"
            ? tenderedForReceipt(plan.length, tenderedValue)
            : null,
        idempotencyKey: keyFor(payment.key),
      });

      if (!result.ok) {
        // The database's own words: if this fires, a balance moved under us.
        setIssued(receipts);
        setFailure(result.error);
        setSubmitting(false);
        setConfirmOpen(false);
        // Stay locked while receipts are half issued: a scan here would wipe
        // the only record on screen of what was and was not recorded.
        onLockChange(receipts.length > 0);
        if (receipts.length === 0) toast.error(result.error);
        return;
      }

      receipts.push({
        paymentId: result.data.paymentId,
        receiptNumber: result.data.receiptNumber,
        total: result.data.total,
        studentName: studentName(payment.studentId),
      });
    }

    finish(receipts, true);
  }

  /** `complete` is false when finishing with only some receipts: the cash counted
   *  was for the whole visit, so no change figure can be trusted. */
  function finish(receipts: IssuedReceipt[], complete: boolean) {
    const received = sumMoney(receipts.map((r) => r.total));
    setSubmitting(false);
    setConfirmOpen(false);
    onLockChange(false);
    onCollected({
      payerName: household.name,
      receipts,
      total: received,
      change:
        complete && method === "cash" && tenderedValue !== null
          ? subtractMoney(tenderedValue, received)
          : null,
      remaining: subtractMoney(familyBalance, received),
    });
  }

  const nothingOwed = lines.length === 0;

  return (
    <div
      className={cn(
        "grid gap-6",
        !nothingOwed && "lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start",
      )}
    >
      <div className="min-w-0 space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              {viaCard && <CreditCard className="size-3.5" aria-hidden />}
              {household.kind === "parent"
                ? viaCard
                  ? "Parent, from card"
                  : "Parent"
                : "Student"}
            </p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-balance">
              {household.name}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {[
                household.guardians.length > 0
                  ? `Parent: ${household.guardians.join(", ")}`
                  : null,
                household.contact,
              ]
                .filter(Boolean)
                .join(" · ") || "No contact number on file"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Total balance</p>
            <p className="text-3xl font-semibold tracking-tight tabular-nums">
              {formatMoney(familyBalance)}
            </p>
          </div>
        </header>

        {household.students.length === 0 && (
          <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
            No students are linked to this parent.
          </p>
        )}

        {household.students.map((student) => {
          const own = lines.filter((l) => l.studentId === student.id);
          const balance = sumMoney(own.map((l) => l.balance));
          return (
            <section
              key={student.id}
              aria-label={student.name}
              className="overflow-hidden rounded-xl border bg-card"
            >
              <div className="flex items-baseline justify-between gap-3 border-b px-4 py-3">
                <div className="min-w-0">
                  <h2 className="truncate font-medium">{student.name}</h2>
                  <p className="truncate text-xs text-muted-foreground">
                    {student.gradeLevel
                      ? [student.gradeLevel, student.sectionName, student.studentNumber]
                          .filter(Boolean)
                          .join(" · ")
                      : "Not enrolled this school year"}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-medium tabular-nums">
                  {formatMoney(balance)}
                </p>
              </div>

              {own.length === 0 ? (
                <p className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                  <CircleCheck className="size-4 text-success" aria-hidden />
                  Fully paid
                </p>
              ) : (
                <ul className="divide-y">
                  {own.map((line) => (
                    <ChargeRow
                      key={line.chargeId}
                      line={line}
                      disabled={partial || submitting}
                      onToggle={(selected) =>
                        setLines((ls) => toggleLine(ls, line.chargeId, selected))
                      }
                      onAmount={(amount) =>
                        setLines((ls) => setLineAmount(ls, line.chargeId, amount))
                      }
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}

        {nothingOwed && household.students.length > 0 && (
          <p className="flex items-center justify-center gap-2 py-4 text-sm font-medium text-success">
            <CircleCheck className="size-4" aria-hidden />
            Nothing to collect. This account is fully paid.
          </p>
        )}
      </div>

      {!nothingOwed && (
        <aside
          aria-label="Receive payment"
          className="space-y-4 rounded-xl border bg-card p-4 lg:sticky lg:top-20"
        >
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full"
            disabled={partial || submitting}
            onClick={() => setLines((ls) => (allSelected ? clearAll(ls) : selectAll(ls)))}
          >
            {allSelected ? "Clear selection" : "Pay full balance"}
          </Button>

          <div className="flex items-baseline justify-between gap-3 border-t pt-4">
            <span className="text-sm text-muted-foreground">To receive</span>
            <span className="text-3xl font-semibold tracking-tight tabular-nums">
              {formatMoney(total)}
            </span>
          </div>

          <div role="group" aria-label="Payment method" className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1">
            {METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                aria-pressed={method === m.value}
                disabled={partial || submitting}
                onClick={() => {
                  setMethod(m.value);
                  setTendered("");
                }}
                className={cn(
                  "min-h-10 cursor-pointer rounded-md text-sm font-medium transition-colors disabled:cursor-not-allowed",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  method === m.value
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          {method === "cash" ? (
            <div className="space-y-2">
              <Label htmlFor="cashier-tendered">
                Cash received{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="cashier-tendered"
                inputMode="decimal"
                autoComplete="off"
                disabled={partial || submitting}
                value={tendered}
                onChange={(e) => setTendered(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    attempt();
                  }
                }}
                placeholder="0.00"
                aria-invalid={shortTendered}
                aria-describedby={shortTendered ? "cashier-tendered-error" : undefined}
                className="h-12 text-right text-lg tabular-nums"
              />
              {total > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {quickTenders(total).map((amount) => (
                    <Button
                      key={amount}
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="min-h-9 flex-1 tabular-nums"
                      disabled={partial || submitting}
                      onClick={() => setTendered(String(amount))}
                    >
                      {amount === total ? "Exact" : formatMoney(amount).replace(".00", "")}
                    </Button>
                  ))}
                </div>
              )}
              {shortTendered && (
                <p id="cashier-tendered-error" className="text-sm font-medium text-destructive">
                  Short by {formatMoney(subtractMoney(total, tenderedValue ?? 0))}.
                </p>
              )}
              {change !== null && !partial && (
                <div
                  aria-live="polite"
                  className="flex items-baseline justify-between gap-3 rounded-lg bg-success/10 px-3 py-2.5"
                >
                  <span className="text-sm font-medium">Change</span>
                  <span className="text-2xl font-semibold tabular-nums">
                    {formatMoney(change)}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="cashier-reference">Reference number</Label>
              <Input
                id="cashier-reference"
                autoComplete="off"
                disabled={partial || submitting}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                aria-invalid={attempted && needsReference}
                className="h-11"
              />
            </div>
          )}

          {plan.length > 1 && !partial && (
            <p className="text-sm text-muted-foreground">
              {plan.length} receipts will be issued: one per child and school year.
            </p>
          )}

          {attempted && problems.length > 0 && !partial && (
            <ul role="alert" className="space-y-1 text-sm font-medium text-destructive">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}

          {partial ? (
            <div
              role="alert"
              className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm"
            >
              <p className="flex items-start gap-2 font-medium text-destructive">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                Only {issued.length} of {plan.length} receipts were recorded.
              </p>
              <p>{failure}</p>
              <p className="font-medium">
                Collect only {formatMoney(sumMoney(issued.map((r) => r.total)))} unless
                the retry succeeds.
              </p>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={record} disabled={submitting}>
                  {submitting ? (
                    <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
                  ) : (
                    <RotateCw className="size-4" aria-hidden />
                  )}
                  Try again
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => finish(issued, false)}
                  disabled={submitting}
                >
                  Finish
                </Button>
              </div>
            </div>
          ) : (
            <Button
              className="h-12 w-full text-base"
              disabled={submitting}
              onClick={attempt}
            >
              {total > 0 ? `Receive ${formatMoney(total)}` : "Select what to pay"}
            </Button>
          )}
        </aside>
      )}

      <ConfirmPaymentDialog
        open={confirmOpen}
        onOpenChange={setConfirm}
        payerLabel={household.kind === "parent" ? "Parent" : "Student"}
        studentName={household.name}
        lines={lines.filter((l) => l.selected).map(describeLine)}
        total={total}
        method={METHODS.find((m) => m.value === method)!.label}
        change={change}
        submitting={submitting}
        onConfirm={record}
        description={
          plan.length > 1
            ? `${plan.length} receipts will be issued. Check the amounts: only a treasurer or administrator can void a receipt.`
            : "A receipt will be issued. Check the amount: only a treasurer or administrator can void a receipt."
        }
      />
    </div>
  );
}

function ChargeRow({
  line,
  disabled,
  onToggle,
  onAmount,
}: {
  line: CollectLine;
  disabled: boolean;
  onToggle: (selected: boolean) => void;
  onAmount: (amount: number) => void;
}) {
  const checkboxId = `charge-${line.chargeId}`;
  // What is being typed, kept apart from the parsed amount. Rendering the number
  // back while typing would eat the "." of "250." and make centavos unenterable.
  const [draft, setDraft] = useState<string | null>(null);
  const notes = [
    line.description,
    line.dueDate ? `Due ${formatDate(line.dueDate)}` : null,
    line.priorYear ? `SY ${line.schoolYearName}` : null,
  ].filter(Boolean);

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 px-4 transition-colors",
        line.selected && "bg-accent/40",
      )}
    >
      <label
        htmlFor={checkboxId}
        className="flex min-h-14 min-w-0 flex-1 basis-48 cursor-pointer items-center gap-3 py-2"
      >
        <Checkbox
          id={checkboxId}
          checked={line.selected}
          disabled={disabled}
          onCheckedChange={(value) => onToggle(Boolean(value))}
        />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{line.feeTypeName}</span>
          {notes.length > 0 && (
            <span
              className={cn(
                "block truncate text-xs",
                line.priorYear ? "font-medium text-destructive" : "text-muted-foreground",
              )}
            >
              {notes.join(" · ")}
            </span>
          )}
        </span>
      </label>

      {line.selected ? (
        <div className="mb-2 ml-auto sm:mb-0">
          <label htmlFor={`${checkboxId}-amount`} className="sr-only">
            Amount for {line.feeTypeName}, up to {formatMoney(line.balance)}
          </label>
          <Input
            id={`${checkboxId}-amount`}
            inputMode="decimal"
            autoComplete="off"
            disabled={disabled}
            value={draft ?? String(line.amount)}
            onChange={(e) => {
              setDraft(e.target.value);
              onAmount(parseMoneyInput(e.target.value));
            }}
            onBlur={() => setDraft(null)}
            className="h-10 w-28 text-right tabular-nums"
          />
        </div>
      ) : (
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">
          {formatMoney(line.balance)}
        </span>
      )}
    </li>
  );
}
