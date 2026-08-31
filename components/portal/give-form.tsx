"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { CheckCircle2, HandCoins, HeartHandshake, Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";

import {
  createPortalPledge,
  submitClaim,
  uploadProof,
} from "@/app/actions/portal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { peso, t } from "@/lib/portal/i18n";
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
  const fileInput = useRef<HTMLInputElement>(null);

  const value = Number(amount);
  const validAmount = Number.isFinite(value) && value > 0;

  async function attach(file: File) {
    setUploading(true);
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
      reset();
      router.push(mode === "donate" ? "/portal/claims" : "/portal/give");
      router.refresh();
    });
  }

  const progress =
    program.target_amount && Number(program.target_amount) > 0
      ? Math.min(100, (Number(program.raised_cash) / Number(program.target_amount)) * 100)
      : null;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div>
          <p className="font-semibold">{program.name}</p>
          {program.description && (
            <p className="mt-1 text-sm text-muted-foreground">{program.description}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-mono font-medium tabular-nums">
              {peso(program.raised_cash)}{" "}
              <span className="font-sans font-normal text-muted-foreground">
                {copy.raised}
              </span>
            </span>
            {program.target_amount && (
              <span className="text-muted-foreground">
                {copy.ofTarget} {peso(program.target_amount)}
              </span>
            )}
          </div>
          {progress !== null && (
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>

        {mode === null ? (
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              className="flex-1"
              onClick={() => setMode("donate")}
            >
              <HandCoins className="mr-1.5 size-4" />
              {copy.donate}
            </Button>
            {program.accepts_pledges && (
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => setMode("pledge")}
              >
                <HeartHandshake className="mr-1.5 size-4" />
                {copy.pledge}
              </Button>
            )}
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3 border-t pt-3">
            <div className="space-y-2">
              <Label htmlFor={`amount-${program.id}`}>
                {mode === "pledge" ? copy.pledgeAmount : copy.amount}
              </Label>
              <Input
                id={`amount-${program.id}`}
                inputMode="decimal"
                autoFocus
                className="h-11 font-mono"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              />
            </div>

            {mode === "donate" ? (
              <>
                {gcashNumber && (
                  <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                    {copy.payStep1}{" "}
                    <span className="font-mono font-semibold text-foreground">
                      {gcashNumber}
                    </span>
                  </p>
                )}

                <div className="space-y-2">
                  <Label htmlFor={`ref-${program.id}`}>{copy.referenceNumber}</Label>
                  <Input
                    id={`ref-${program.id}`}
                    inputMode="numeric"
                    className="h-11 font-mono"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                  />
                </div>

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

                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={anonymous}
                    onCheckedChange={(v) => setAnonymous(v === true)}
                  />
                  {copy.giveAnonymously}
                </label>
              </>
            ) : (
              <div className="space-y-2">
                <Label htmlFor={`due-${program.id}`}>{copy.pledgeBy}</Label>
                <Input
                  id={`due-${program.id}`}
                  type="date"
                  className="h-11"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            )}

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={reset}>
                {copy.cancel}
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={
                  pending ||
                  uploading ||
                  !validAmount ||
                  (mode === "donate" && reference.trim().length < 4)
                }
              >
                {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
                {mode === "donate" ? copy.submitClaim : copy.pledge}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
