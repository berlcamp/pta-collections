"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { portalChangePin } from "@/app/actions/portal-auth";
import {
  portalButton,
  portalInput,
  portalLabel,
} from "@/components/portal/styles";
import { cn } from "@/lib/utils";
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
        <p
          role="alert"
          className="rounded-2xl bg-red-50 p-3.5 text-sm text-red-700 ring-1 ring-red-200"
        >
          {error ?? copy.pinMismatch}
        </p>
      )}

      <button
        type="submit"
        className={portalButton}
        disabled={
          pending || current.length !== 6 || next.length !== 6 || next !== confirm
        }
      >
        {pending && <Loader2 className="size-5 animate-spin" />}
        {copy.savePin}
      </button>
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
    <div>
      <label htmlFor={id} className={portalLabel}>
        {label}
      </label>
      <input
        id={id}
        type="password"
        inputMode="numeric"
        autoComplete="new-password"
        autoFocus={autoFocus}
        aria-invalid={invalid}
        placeholder="••••••"
        className={cn(portalInput, "text-center font-mono text-xl tracking-[0.5em]")}
        value={value}
        onChange={(e) => onChange(digits(e.target.value))}
      />
    </div>
  );
}
