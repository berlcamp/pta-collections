"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/browser";
import { formatMoney, parseMoneyInput, subtractMoney } from "@/lib/financial/money";
import {
  allocationTotal,
  buildAllocationLines,
  setLineAmount,
  toRpcItems,
  toggleLine,
  validateAllocation,
  type AllocationLine,
} from "@/lib/financial/allocation";
import { formatDate } from "@/lib/utils/dates";
import { formatNameFull } from "@/lib/utils/names";
import type { ChargeBalance, PaymentMethod, Student } from "@/types/database.types";
import { createPayment } from "@/app/actions/payments";
import { ConfirmPaymentDialog } from "./confirm-payment-dialog";

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "gcash", label: "GCash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "other", label: "Other" },
];

export function PaymentComposer({
  schoolYearId,
  studentId,
  onBack,
}: {
  schoolYearId: string;
  studentId: string;
  onBack: () => void;
}) {
  const router = useRouter();
  const [student, setStudent] = useState<Student | null>(null);
  const [lines, setLines] = useState<AllocationLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");
  const [tendered, setTendered] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /** Errors stay hidden until the cashier actually tries to record. */
  const [attempted, setAttempted] = useState(false);

  /**
   * Generated once when the composer mounts and reused for every retry of THIS
   * payment. pta.create_payment treats a repeated key as the same transaction,
   * so a double-click or a retried request cannot create two payments.
   */
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const [{ data: s }, { data: charges }] = await Promise.all([
        supabase.from("students").select("*").eq("id", studentId).maybeSingle(),
        supabase
          .from("v_student_charge_balances")
          .select("*")
          .eq("student_id", studentId)
          .eq("school_year_id", schoolYearId),
      ]);
      if (cancelled) return;
      setStudent(s as Student | null);
      setLines(buildAllocationLines((charges ?? []) as ChargeBalance[]));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId, schoolYearId]);

  const total = useMemo(() => allocationTotal(lines), [lines]);
  const validation = useMemo(() => validateAllocation(lines), [lines]);
  const tenderedValue = tendered ? parseMoneyInput(tendered) : null;
  const change =
    method === "cash" && tenderedValue !== null && tenderedValue >= total
      ? subtractMoney(tenderedValue, total)
      : null;

  /**
   * Everything standing between this screen and a receipt, as sentences.
   *
   * The old version only disabled the button, which left a cashier with a queue
   * in front of them staring at a dead control with no idea why. The button now
   * always responds; it just reports what is wrong.
   */
  const problems: string[] = [
    ...(lines.some((l) => l.selected) ? [] : ["Select at least one charge to pay."]),
    ...validation.errors,
    ...(method !== "cash" && reference.trim().length === 0
      ? ["A reference number is required for non-cash payments."]
      : []),
    ...(method === "cash" && tenderedValue !== null && tenderedValue < total
      ? ["Amount tendered is less than the total."]
      : []),
  ];

  const referenceInvalid =
    attempted && method !== "cash" && reference.trim().length === 0;
  const tenderedInvalid =
    method === "cash" && tenderedValue !== null && tenderedValue < total;

  function attemptSubmit() {
    if (problems.length > 0) {
      setAttempted(true);
      return;
    }
    setConfirmOpen(true);
  }

  async function submit() {
    setSubmitting(true);
    const result = await createPayment({
      studentId,
      schoolYearId,
      paymentMethod: method,
      items: toRpcItems(lines),
      referenceNumber: reference.trim() || null,
      remarks: remarks.trim() || null,
      amountTendered: method === "cash" && tenderedValue ? tenderedValue : null,
      idempotencyKey,
    });

    if (!result.ok) {
      // If this fires, the UI and the database disagreed about a balance —
      // show the database's message verbatim rather than paraphrasing it.
      toast.error(result.error);
      setSubmitting(false);
      setConfirmOpen(false);
      return;
    }

    toast.success(`Receipt ${result.data.receiptNumber} recorded.`);
    router.push(`/collections/${result.data.paymentId}`);
  }

  if (loading) {
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">
        Student not found.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="size-4" />
        Back to search
      </Button>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {formatNameFull(student)}
              {student.lrn && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  LRN {student.lrn}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {lines.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                This student has no outstanding charges.
              </p>
            ) : (
              <>
                <div className="hidden grid-cols-[auto_1fr_7rem_8rem] gap-3 px-2 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase sm:grid">
                  <span className="w-5" />
                  <span>Charge</span>
                  <span className="text-right">Balance</span>
                  <span className="text-right">Paying</span>
                </div>

                {lines.map((line) => (
                  <div
                    key={line.chargeId}
                    className="grid grid-cols-[auto_1fr] items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50 sm:grid-cols-[auto_1fr_7rem_8rem]"
                  >
                    <Checkbox
                      checked={line.selected}
                      onCheckedChange={(v) =>
                        setLines((ls) => toggleLine(ls, line.chargeId, Boolean(v)))
                      }
                      aria-label={`Pay ${line.feeTypeName}`}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{line.feeTypeName}</p>
                      {(line.description || line.dueDate) && (
                        <p className="truncate text-xs text-muted-foreground">
                          {line.description}
                          {line.dueDate && ` · due ${formatDate(line.dueDate)}`}
                        </p>
                      )}
                    </div>
                    <p className="hidden text-right font-mono text-sm tabular-nums text-muted-foreground sm:block">
                      {formatMoney(line.balance)}
                    </p>
                    <div className="col-span-2 sm:col-span-1">
                      <Input
                        inputMode="decimal"
                        disabled={!line.selected}
                        value={line.selected ? String(line.amount) : ""}
                        onChange={(e) =>
                          setLines((ls) =>
                            setLineAmount(
                              ls,
                              line.chargeId,
                              parseMoneyInput(e.target.value),
                            ),
                          )
                        }
                        className="h-8 text-right font-mono tabular-nums"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-4">
              <div>
                <Label htmlFor="method" className="text-xs">
                  Payment method
                </Label>
                <Select
                  value={method}
                  onValueChange={(v) => {
                    setMethod(v as PaymentMethod);
                    setTendered("");
                  }}
                >
                  <SelectTrigger id="method" className="mt-1 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {method !== "cash" && (
                <div>
                  <Label htmlFor="reference" className="text-xs">
                    Reference number
                  </Label>
                  <Input
                    id="reference"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="GCash / bank reference"
                    className="mt-1"
                    aria-invalid={referenceInvalid}
                    aria-describedby="reference-error"
                  />
                  {referenceInvalid && (
                    <p
                      id="reference-error"
                      className="mt-1.5 text-xs font-medium text-destructive"
                    >
                      A reference number is required for {method.replace("_", " ")}{" "}
                      payments.
                    </p>
                  )}
                </div>
              )}

              <div>
                <Label htmlFor="remarks" className="text-xs">
                  Remarks <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="remarks"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={2}
                  className="mt-1 resize-none"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Total to pay</span>
                <span className="font-mono text-2xl font-semibold tabular-nums">
                  {formatMoney(total)}
                </span>
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                The total is the sum of the lines above and cannot be typed
                directly.
              </p>

              {method === "cash" && (
                <>
                  <Separator />
                  <div>
                    <Label htmlFor="tendered" className="text-xs">
                      Amount tendered{" "}
                      <span className="text-muted-foreground">(optional)</span>
                    </Label>
                    <Input
                      id="tendered"
                      inputMode="decimal"
                      value={tendered}
                      onChange={(e) => setTendered(e.target.value)}
                      placeholder="0.00"
                      className="mt-1 text-right font-mono tabular-nums"
                      aria-invalid={tenderedInvalid}
                      aria-describedby="tendered-error"
                    />
                  </div>
                  {tenderedInvalid && (
                    <p
                      id="tendered-error"
                      className="text-xs font-medium text-destructive"
                    >
                      Tendered is less than the total.
                    </p>
                  )}
                  {change !== null && (
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-muted-foreground">Change</span>
                      <span className="font-mono font-semibold tabular-nums">
                        {formatMoney(change)}
                      </span>
                    </div>
                  )}
                </>
              )}

              {attempted && problems.length > 0 && (
                <ul
                  role="alert"
                  className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive"
                >
                  {problems.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}

              <Button
                className="w-full"
                size="lg"
                disabled={submitting || lines.length === 0}
                onClick={attemptSubmit}
              >
                <Receipt className="size-4" />
                Record payment
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmPaymentDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        studentName={formatNameFull(student)}
        lines={lines.filter((l) => l.selected)}
        total={total}
        method={METHODS.find((m) => m.value === method)!.label}
        change={change}
        submitting={submitting}
        onConfirm={submit}
      />
    </div>
  );
}
