"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { HandCoins, HeartHandshake, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  createPortalPledge,
  submitClaim,
  uploadProof,
} from "@/app/actions/portal";
import { GcashNumber } from "@/components/portal/gcash-number";
import { ProofUpload } from "@/components/portal/proof-upload";
import {
  portalButton,
  portalCard,
  portalGhostButton,
  portalInput,
  portalLabel,
} from "@/components/portal/styles";
import { peso, t } from "@/lib/portal/i18n";
import { cn } from "@/lib/utils";
import type { PortalLocale, PortalProgram } from "@/types/database.types";

type Mode = "donate" | "pledge" | null;

/**
 * Giving, both kinds.
 *
 * A DONATION is money already sent, so it goes through the same claim queue a
 * fee payment does — nothing is recorded until a cashier confirms the transfer.
 * A PLEDGE moves no money at all, so it writes straight through with no queue;
 * 0014 deliberately puts no overpayment guard on pledges, because
 * over-delivering on a promise is generosity rather than an error.
 */
export function GiveForm({
  program,
  locale,
  gcashNumber,
}: {
  program: PortalProgram;
  locale: PortalLocale;
  gcashNumber: string | null;
}) {
  const copy = t(locale);
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [proofPath, setProofPath] = useState<string | null>(null);
  const [proofName, setProofName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = Number(amount);
  const validAmount = Number.isFinite(value) && value > 0;

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

  function reset() {
    setMode(null);
    setAmount("");
    setReference("");
    setDueDate("");
    setProofPath(null);
    setProofName(null);
    setError(null);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result =
        mode === "donate"
          ? await submitClaim({
              claimType: "donation",
              programId: program.id,
              amount: value,
              paymentMethod: "gcash",
              referenceNumber: reference,
              proofPath,
              isAnonymous: anonymous,
            })
          : await createPortalPledge({
              programId: program.id,
              amount: value,
              dueDate: dueDate || null,
            });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      toast.success(mode === "donate" ? copy.claimSubmitted : copy.pledgeMade);
      const wasDonation = mode === "donate";
      reset();
      router.push(wasDonation ? "/portal/pay/history" : "/portal/pay/give");
      router.refresh();
    });
  }

  const progress =
    program.target_amount && Number(program.target_amount) > 0
      ? Math.min(100, (Number(program.raised_cash) / Number(program.target_amount)) * 100)
      : null;

  return (
    <article className={cn(portalCard, "p-4")}>
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600">
          <HeartHandshake className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">{program.name}</p>
          {program.description && (
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              {program.description}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-baseline justify-between gap-3 text-xs">
          <span className="font-mono font-semibold tabular-nums text-slate-900">
            {peso(program.raised_cash)}{" "}
            <span className="font-sans font-normal text-slate-500">{copy.raised}</span>
          </span>
          {program.target_amount && (
            <span className="text-slate-500">
              {copy.ofTarget} {peso(program.target_amount)}
            </span>
          )}
        </div>
        {progress !== null && (
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="portal-cta h-full rounded-full transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      {mode === null ? (
        <div className="mt-4 grid gap-2">
          <button type="button" className={portalButton} onClick={() => setMode("donate")}>
            <HandCoins className="size-5" />
            {copy.donate}
          </button>
          {program.accepts_pledges && (
            <button
              type="button"
              className={cn(portalGhostButton, "text-blue-700")}
              onClick={() => setMode("pledge")}
            >
              {copy.pledge}
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="portal-in mt-4 space-y-4 border-t border-slate-100 pt-4">
          <div>
            <label htmlFor={`amount-${program.id}`} className={portalLabel}>
              {mode === "pledge" ? copy.pledgeAmount : copy.amount}
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-mono text-lg text-slate-400">
                ₱
              </span>
              <input
                id={`amount-${program.id}`}
                inputMode="decimal"
                autoFocus
                placeholder="0.00"
                className={cn(portalInput, "pl-10 font-mono text-lg")}
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              />
            </div>
          </div>

          {mode === "donate" ? (
            <>
              {gcashNumber ? (
                <GcashNumber number={gcashNumber} locale={locale} />
              ) : (
                <p className="text-sm text-slate-600">{copy.payStep1}</p>
              )}

              <div>
                <label htmlFor={`ref-${program.id}`} className={portalLabel}>
                  {copy.referenceNumber}
                </label>
                <input
                  id={`ref-${program.id}`}
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

              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl px-1 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="size-5 shrink-0 cursor-pointer accent-blue-600"
                  checked={anonymous}
                  onChange={(e) => setAnonymous(e.target.checked)}
                />
                {copy.giveAnonymously}
              </label>
            </>
          ) : (
            <div>
              <label htmlFor={`due-${program.id}`} className={portalLabel}>
                {copy.pledgeBy}
              </label>
              <input
                id={`due-${program.id}`}
                type="date"
                className={portalInput}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-2xl bg-red-50 p-3.5 text-sm text-red-700 ring-1 ring-red-200"
            >
              {error}
            </p>
          )}

          <div className="grid gap-2">
            <button
              type="submit"
              className={portalButton}
              disabled={
                pending ||
                uploading ||
                !validAmount ||
                (mode === "donate" && reference.trim().length < 4)
              }
            >
              {pending && <Loader2 className="size-5 animate-spin" />}
              {mode === "donate" ? copy.submitClaim : copy.pledge}
            </button>
            <button type="button" className={portalGhostButton} onClick={reset}>
              {copy.cancel}
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
