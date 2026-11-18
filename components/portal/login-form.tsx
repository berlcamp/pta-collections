"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertCircle, ArrowRight, CreditCard, KeyRound, Loader2 } from "lucide-react";

import { portalLogin } from "@/app/actions/portal-auth";
import {
  portalButton,
  portalInput,
  portalLabel,
} from "@/components/portal/styles";
import { cn } from "@/lib/utils";
import { formatCardNumber, normalizeCardNumber } from "@/lib/portal/card";
import { t } from "@/lib/portal/i18n";
import type { PortalLocale } from "@/types/database.types";

export function PortalLoginForm({ locale }: { locale: PortalLocale }) {
  const copy = t(locale);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [card, setCard] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  // Whether a PIN is wanted is a per-school setting (0017), and the school is
  // not known until a card has been submitted. So the field stays hidden until
  // portal_login() asks for one -- which it only does for a card that exists.
  const [pinNeeded, setPinNeeded] = useState(false);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setAttemptsLeft(null);

    startTransition(async () => {
      const result = await portalLogin({
        cardNumber: normalizeCardNumber(card),
        pin: pinNeeded ? pin : "",
      });

      if (!result.ok) {
        if (result.reason === "pin_required") {
          // Not an error the parent caused. Reveal the field and let them
          // continue rather than making them re-enter the card number.
          setPinNeeded(true);
          return;
        }

        setError(
          result.reason === "locked"
            ? copy.lockedLogin
            : result.reason === "throttled"
              ? copy.throttledLogin
              : copy.invalidLogin,
        );
        if (typeof result.attemptsLeft === "number" && result.attemptsLeft > 0) {
          setAttemptsLeft(result.attemptsLeft);
        }
        setPin("");
        return;
      }

      router.replace(result.mustChangePin ? "/portal/set-pin" : "/portal");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label htmlFor="card" className={portalLabel}>
          {copy.cardNumber}
        </label>
        <div className="relative">
          <CreditCard className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
          <input
            id="card"
            // A barcode scanner is a keyboard. inputMode numeric brings up the
            // number pad for anyone typing it by hand instead.
            inputMode="numeric"
            autoComplete="off"
            autoFocus={!pinNeeded}
            placeholder="0000 0000 0000 0000"
            aria-invalid={error ? true : undefined}
            className={cn(portalInput, "pl-12 font-mono text-lg tracking-wider")}
            value={formatCardNumber(card)}
            onChange={(e) => setCard(normalizeCardNumber(e.target.value).slice(0, 16))}
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">{copy.cardHint}</p>
      </div>

      {pinNeeded && (
        <div className="portal-in">
          <label htmlFor="pin" className={portalLabel}>
            {copy.pin}
          </label>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
            <input
              id="pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              autoFocus
              placeholder="••••••"
              aria-invalid={error ? true : undefined}
              className={cn(portalInput, "pl-12 font-mono text-lg tracking-[0.4em]")}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">{copy.pinHint}</p>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex gap-2.5 rounded-2xl bg-red-50 p-3.5 text-sm text-red-700 ring-1 ring-red-200"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p>{error}</p>
            {attemptsLeft !== null && (
              <p className="mt-1 text-xs">{copy.attemptsLeft(attemptsLeft)}</p>
            )}
          </div>
        </div>
      )}

      <button
        type="submit"
        className={portalButton}
        disabled={pending || card.length !== 16 || (pinNeeded && pin.length !== 6)}
      >
        {pending ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          <>
            {pinNeeded ? copy.signIn : copy.continue}
            <ArrowRight className="size-5" />
          </>
        )}
      </button>

      {/* Not a link. A "forgot PIN" flow needing only the card number would
          hand every POS cashier a way into any parent's account — see
          reset_parent_pin() in 0016. */}
      {pinNeeded && (
        <details className="text-sm text-slate-500">
          <summary className="cursor-pointer py-2 text-center font-medium text-blue-700">
            {copy.forgotPin}
          </summary>
          <p className="mt-1 leading-relaxed">{copy.forgotPinHelp}</p>
        </details>
      )}
    </form>
  );
}
