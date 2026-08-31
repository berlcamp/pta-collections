"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { CheckCircle2, Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";

import { submitClaim, uploadProof } from "@/app/actions/portal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { peso, t } from "@/lib/portal/i18n";
import type { PortalBalance, PortalLocale } from "@/types/database.types";

/**
 * Select fees, then say what you sent.
 *
 * The two halves are one screen on purpose. Splitting "choose what to pay" from
 * "tell us the reference" across two routes loses the total a parent is holding
 * in their head while they switch to GCash — and the total is the number they
 * have to type into GCash exactly.
 *
 * Nothing here reduces a balance. The claim is an assertion; the balance moves
 * when a cashier confirms it against the GCash app.
 */
export function PayForm({
  balances,
  locale,
  gcashNumber,
}: {
  balances: PortalBalance[];
  locale: PortalLocale;
  gcashNumber: string | null;
}) {
  const copy = t(locale);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reference, setReference] = useState("");
  const [proofName, setProofName] = useState<string | null>(null);
  const [proofPath, setProofPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // A claim settles ONE student — pta.payments names a single student and a
  // single enrollment, so a basket spanning two children could not be posted.
  const studentId = useMemo(() => {
    const first = balances.find((b) => selected.has(b.charge_id));
    return first?.student_id ?? null;
  }, [balances, selected]);

  const chosen = balances.filter(
    (b) => selected.has(b.charge_id) && b.student_id === studentId,
  );
  const total = chosen.reduce((sum, b) => sum + Number(b.balance), 0);

  function toggle(balance: PortalBalance) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(balance.charge_id)) {
        next.delete(balance.charge_id);
        return next;
      }
      // Switching child clears the basket rather than silently dropping the
      // other child's lines at submit time.
      if (studentId && balance.student_id !== studentId) return new Set([balance.charge_id]);
      next.add(balance.charge_id);
      return next;
    });
  }

  async function attach(file: File) {
    setUploading(true);
    setError(null);
    const form = new FormData();
    form.set("proof", file);
    const result = await uploadProof(form);
    setUploading(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setProofPath(result.data);
    setProofName(file.name);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await submitClaim({
        claimType: "fee",
        studentId,
        items: chosen.map((b) => ({
          charge_id: b.charge_id,
          amount: Number(b.balance),
        })),
        amount: total,
        paymentMethod: "gcash",
        referenceNumber: reference,
        proofPath,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      toast.success(copy.claimSubmitted);
      router.push("/portal/claims");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted-foreground">{copy.selectFees}</p>

      <Card>
        <CardContent className="divide-y p-0">
          {balances.map((balance) => {
            const checked = selected.has(balance.charge_id);
            const otherChild = Boolean(studentId && balance.student_id !== studentId);
            return (
              <label
                key={balance.charge_id}
                className="flex cursor-pointer items-center gap-3 p-3"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(balance)}
                  aria-label={balance.fee_type_name}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {balance.fee_type_name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {balance.student_name}
                    {balance.due_date && ` · ${copy.feeDue} ${balance.due_date}`}
                  </p>
                </div>
                <span
                  className={
                    otherChild
                      ? "font-mono text-sm tabular-nums text-muted-foreground/50"
                      : "font-mono text-sm tabular-nums"
                  }
                >
                  {peso(balance.balance)}
                </span>
              </label>
            );
          })}
        </CardContent>
      </Card>

      {chosen.length > 0 && (
        <Card className="border-primary/40">
          <CardContent className="space-y-4 p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">{copy.amount}</span>
              <span className="font-mono text-2xl font-semibold tabular-nums">
                {peso(total)}
              </span>
            </div>

            <ol className="space-y-1.5 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              <li>
                1. {copy.payStep1}
                {gcashNumber && (
                  <span className="ml-1 font-mono font-semibold text-foreground">
                    {gcashNumber}
                  </span>
                )}
              </li>
              <li>2. {copy.payStep2}</li>
              <li>3. {copy.payStep3}</li>
            </ol>

            <div className="space-y-2">
              <Label htmlFor="reference">{copy.referenceNumber}</Label>
              <Input
                id="reference"
                inputMode="numeric"
                autoComplete="off"
                className="h-11 font-mono"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{copy.referenceHint}</p>
            </div>

            <div className="space-y-2">
              <Label>{copy.proof}</Label>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void attach(file);
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full justify-start"
                disabled={uploading}
                onClick={() => fileInput.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : proofPath ? (
                  <CheckCircle2 className="mr-2 size-4 text-emerald-600" />
                ) : (
                  <Paperclip className="mr-2 size-4" />
                )}
                <span className="truncate">{proofName ?? copy.proof}</span>
              </Button>
              <p className="text-xs text-muted-foreground">{copy.proofHint}</p>
            </div>

            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
              {copy.balanceNotYetUpdated}
            </p>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <Button
              type="submit"
              size="lg"
              className="h-12 w-full text-base"
              disabled={pending || uploading || reference.trim().length < 4}
            >
              {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
              {copy.submitClaim}
            </Button>
          </CardContent>
        </Card>
      )}

      {chosen.length === 0 && balances.length > 0 && (
        <Badge variant="secondary" className="w-full justify-center py-2">
          {copy.selectFees}
        </Badge>
      )}
    </form>
  );
}
