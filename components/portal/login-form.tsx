"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CreditCard, KeyRound, Loader2 } from "lucide-react";

import { portalLogin } from "@/app/actions/portal-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
      <div className="space-y-2">
        <Label htmlFor="card">{copy.cardNumber}</Label>
        <div className="relative">
          <CreditCard className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="card"
            // A barcode scanner is a keyboard. inputMode numeric brings up the
            // number pad for anyone typing it by hand instead.
            inputMode="numeric"
            autoComplete="off"
            autoFocus={!pinNeeded}
            placeholder="0000 0000 0000 0000"
            className="h-12 pl-9 font-mono text-base tracking-wider"
            value={formatCardNumber(card)}
            onChange={(e) => setCard(normalizeCardNumber(e.target.value).slice(0, 16))}
          />
        </div>
        <p className="text-xs text-muted-foreground">{copy.cardHint}</p>
      </div>

      {pinNeeded && (
      <div className="space-y-2">
        <Label htmlFor="pin">{copy.pin}</Label>
        <div className="relative">
          <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            autoFocus
            placeholder="······"
            className="h-12 pl-9 font-mono text-base tracking-[0.4em]"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
          />
        </div>
        <p className="text-xs text-muted-foreground">{copy.pinHint}</p>
      </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <p>{error}</p>
          {attemptsLeft !== null && (
            <p className="mt-1 text-xs">{copy.attemptsLeft(attemptsLeft)}</p>
          )}
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        className="h-12 w-full text-base"
        disabled={pending || card.length !== 16 || (pinNeeded && pin.length !== 6)}
      >
        {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
        {copy.signIn}
      </Button>

      {/* Not a link. A "forgot PIN" flow needing only the card number would
          hand every POS cashier a way into any parent's account — see
          reset_parent_pin() in 0016. */}
      {pinNeeded && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">{copy.forgotPin}</summary>
          <p className="mt-2 leading-relaxed">{copy.forgotPinHelp}</p>
        </details>
      )}
    </form>
  );
}
