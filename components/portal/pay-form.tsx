"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Check, Info, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { submitClaim, uploadProof } from "@/app/actions/portal";
import { GcashNumber } from "@/components/portal/gcash-number";
import { ProofUpload } from "@/components/portal/proof-upload";
import {
  portalButton,
  portalCard,
  portalInput,
  portalLabel,
} from "@/components/portal/styles";
import { peso, t } from "@/lib/portal/i18n";
import { cn } from "@/lib/utils";
import type { PortalBalance, PortalLocale } from "@/types/database.types";

/**
 * Select fees, then say what you sent.
 *
 * The steps are one screen on purpose. Splitting "choose what to pay" from
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
      router.push("/portal/pay/history");
      router.refresh();
    });
  }

  return (
    // One column on a phone; on a laptop the list sits on the left and the
    // steps that follow from it sit beside it, so the total stays in view.
    <form
      onSubmit={submit}
      className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5 lg:space-y-0"
    >
      {/* ── 1. Choose ─────────────────────────────────────────────────── */}
      <section className={cn(portalCard, "overflow-hidden")}>
        <StepHeading n={1} title={copy.stepChoose} />
        <ul className="divide-y divide-slate-100">
          {balances.map((balance) => {
            const checked = selected.has(balance.charge_id);
            const otherChild = Boolean(studentId && balance.student_id !== studentId);
            return (
              <li key={balance.charge_id}>
                <label
                  className={cn(
                    "flex min-h-16 cursor-pointer items-center gap-3 px-4 py-3 transition-colors",
                    checked ? "bg-blue-50/70" : "hover:bg-slate-50 active:bg-slate-100",
                  )}
                >
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={checked}
                    onChange={() => toggle(balance)}
                  />
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-full ring-2 transition-colors peer-focus-visible:ring-4 peer-focus-visible:ring-blue-300",
                      checked
                        ? "portal-cta text-white ring-transparent"
                        : "bg-white ring-slate-300",
                    )}
                  >
                    {checked && <Check className="size-3.5" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.95rem] font-medium text-slate-900">
                      {balance.fee_type_name}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {balance.student_name}
                      {balance.due_date && ` · ${copy.feeDue} ${balance.due_date}`}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 font-mono text-[0.95rem] font-semibold tabular-nums",
                      otherChild ? "text-slate-300" : "text-slate-900",
                    )}
                  >
                    {peso(balance.balance)}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="space-y-4">
        {chosen.length === 0 && (
          <p className="flex items-center justify-center gap-2 px-4 py-2 text-center text-sm text-slate-500 lg:rounded-3xl lg:border-2 lg:border-dashed lg:border-slate-200 lg:py-16">
            <Info className="size-4 shrink-0" />
            {copy.selectFees}
          </p>
        )}

        {chosen.length > 0 && (
          <>
            {/* ── 2. Send ─────────────────────────────────────────────── */}
            <section className={cn(portalCard, "portal-in")}>
              <StepHeading n={2} title={copy.stepSend} />
              <div className="space-y-4 px-4 pb-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-slate-600">{copy.totalToSend}</span>
                  <span className="font-mono text-[1.75rem] font-semibold tabular-nums text-slate-900">
                    {peso(total)}
                  </span>
                </div>
                {gcashNumber && <GcashNumber number={gcashNumber} locale={locale} />}
                <ol className="space-y-1.5 text-sm text-slate-600">
                  {!gcashNumber && <li>• {copy.payStep1}</li>}
                  <li>• {copy.payStep2}</li>
                  <li>• {copy.payStep3}</li>
                </ol>
              </div>
            </section>

            {/* ── 3. Confirm ──────────────────────────────────────────── */}
            <section className={cn(portalCard, "portal-in")}>
              <StepHeading n={3} title={copy.stepConfirm} />
              <div className="space-y-4 px-4 pb-4">
                <div>
                  <label htmlFor="reference" className={portalLabel}>
                    {copy.referenceNumber}
                  </label>
                  <input
                    id="reference"
                    inputMode="numeric"
                    autoComplete="off"
                    className={cn(portalInput, "font-mono text-lg tracking-wide")}
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                  />
                  <p className="mt-2 text-xs text-slate-500">{copy.referenceHint}</p>
                </div>

                <ProofUpload
                  label={copy.proof}
                  hint={copy.proofHint}
                  fileName={proofName}
                  uploading={uploading}
                  done={Boolean(proofPath)}
                  onPick={(file) => void attach(file)}
                />

                <p className="flex gap-2 rounded-2xl bg-amber-50 p-3.5 text-xs leading-relaxed text-amber-900 ring-1 ring-amber-200">
                  <ShieldCheck className="mt-px size-4 shrink-0" />
                  {copy.balanceNotYetUpdated}
                </p>

                {error && (
                  <p
                    role="alert"
                    className="rounded-2xl bg-red-50 p-3.5 text-sm text-red-700 ring-1 ring-red-200"
                  >
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  className={portalButton}
                  disabled={pending || uploading || reference.trim().length < 4}
                >
                  {pending && <Loader2 className="size-5 animate-spin" />}
                  {copy.submitClaim} · {peso(total)}
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </form>
  );
}

function StepHeading({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="flex items-center gap-2.5 px-4 pb-3 pt-4 text-[0.95rem] font-semibold text-slate-900">
      <span className="grid size-6 place-items-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
        {n}
      </span>
      {title}
    </h2>
  );
}
