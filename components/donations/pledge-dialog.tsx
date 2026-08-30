"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { DonorPicker, type DonorSelection } from "./donor-picker";
import { parseMoneyInput } from "@/lib/financial/money";
import { createPledge } from "@/app/actions/donations";
import type { DonationProgram } from "@/types/database.types";

/**
 * Record a pledge — a promise to give, not money received.
 *
 * Only programs that accept pledges are offered: a one-day fun run has no use
 * for a promise to pay next month, and pta.create_pledge rejects it anyway.
 * A pledge always names its donor; there is deliberately no anonymous option,
 * because an anonymous promise cannot be followed up.
 */
export function PledgeDialog({
  schoolId,
  schoolYearId,
  programs,
  presetProgramId,
}: {
  schoolId: string;
  schoolYearId: string;
  programs: DonationProgram[];
  presetProgramId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const eligible = programs.filter(
    (p) => p.status === "open" && p.accepts_pledges,
  );

  const [programId, setProgramId] = useState(
    presetProgramId && eligible.some((p) => p.id === presetProgramId)
      ? presetProgramId
      : (eligible[0]?.id ?? ""),
  );
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [donor, setDonor] = useState<DonorSelection>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setAmount("");
    setDueDate("");
    setNotes("");
    setDonor(null);
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createPledge({
        schoolYearId,
        programId,
        amount: parseMoneyInput(amount),
        donorId: donor?.kind === "existing" ? donor.donorId : null,
        donor: donor?.kind === "new" ? donor.donor : null,
        dueDate: dueDate || null,
        notes: notes.trim() || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Pledge recorded.");
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  if (eligible.length === 0) {
    return (
      <Button disabled title="No open program is accepting pledges">
        <Plus className="size-4" />
        New pledge
      </Button>
    );
  }

  const canSubmit =
    programId !== "" && parseMoneyInput(amount) > 0 && donor !== null && !pending;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          New pledge
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90svh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record a pledge</DialogTitle>
          <DialogDescription>
            A promise to give, not money received. Nothing is counted as
            collected until the donation is actually recorded against it.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 min-w-0 flex-1 space-y-4 overflow-y-auto px-1">
          <div className="space-y-1.5">
            <Label htmlFor="pledge-program">Program</Label>
            <Select value={programId} onValueChange={setProgramId}>
              <SelectTrigger id="pledge-program" className="w-full">
                <SelectValue placeholder="Choose a program" />
              </SelectTrigger>
              <SelectContent>
                {eligible.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Donor</Label>
            <DonorPicker
              schoolId={schoolId}
              value={donor}
              onChange={setDonor}
              disabled={pending}
              idPrefix="pledge-donor"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pledge-amount">Amount pledged</Label>
              <Input
                id="pledge-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="1,000.00"
                className="text-right font-mono tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pledge-due">
                Due by{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Input
                id="pledge-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pledge-notes">
              Notes{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Textarea
              id="pledge-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="resize-none"
              placeholder="Promised at the general assembly"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={!canSubmit}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Record pledge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
