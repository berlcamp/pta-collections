"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { portalChangePin } from "@/app/actions/portal-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/lib/portal/i18n";
import type { PortalLocale } from "@/types/database.types";

const digits = (value: string) => value.replace(/[^0-9]/g, "").slice(0, 6);

export function SetPinForm({ locale }: { locale: PortalLocale }) {
  const copy = t(locale);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mismatch = confirm.length === 6 && next !== confirm;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (next !== confirm) {
      setError(copy.pinMismatch);
      return;
    }

    startTransition(async () => {
      const result = await portalChangePin({
        currentPin: current,
        newPin: next,
        confirmPin: confirm,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      toast.success(copy.pinSaved);
      router.replace("/portal");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Field
        id="current"
        label={copy.currentPin}
        value={current}
        onChange={setCurrent}
        autoFocus
      />
      <Field id="new" label={copy.newPin} value={next} onChange={setNext} />
      <Field
        id="confirm"
        label={copy.confirmPin}
        value={confirm}
        onChange={setConfirm}
        invalid={mismatch}
      />

      {(error || mismatch) && (
        <p role="alert" className="text-sm text-destructive">
          {error ?? copy.pinMismatch}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        className="h-12 w-full text-base"
        disabled={
          pending || current.length !== 6 || next.length !== 6 || next !== confirm
        }
      >
        {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
        {copy.savePin}
      </Button>
    </form>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  autoFocus,
  invalid,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  invalid?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="password"
        inputMode="numeric"
        autoComplete="new-password"
        autoFocus={autoFocus}
        aria-invalid={invalid}
        placeholder="······"
        className="h-12 text-center font-mono text-lg tracking-[0.5em]"
        value={value}
        onChange={(e) => onChange(digits(e.target.value))}
      />
    </div>
  );
}
