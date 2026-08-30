"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Banknote,
  Check,
  HandCoins,
  Loader2,
  Package,
  Printer,
  UserRoundX,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionHeader } from "@/components/common/page-header";
import { DonorPicker, type DonorSelection } from "./donor-picker";
import { formatMoney, parseMoneyInput } from "@/lib/financial/money";
import { cn } from "@/lib/utils";
import { recordDonation } from "@/app/actions/donations";
import type {
  DonationKind,
  DonationProgram,
  PaymentMethod,
  PledgeStatusRow,
} from "@/types/database.types";

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "gcash", label: "GCash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "other", label: "Other" },
];

/**
 * Record a donation.
 *
 * Hand-rolled state rather than react-hook-form: the shape of this form changes
 * with the kind of gift (cash wants a method, in-kind wants a description) and
 * with anonymity (which removes the donor entirely), and expressing those as a
 * resolver here would duplicate the refinements already in
 * lib/validations/donations.ts and the CHECK constraints in migration 0014.
 * The server action re-validates everything; this only decides what to show.
 *
 * The idempotency key is minted ONCE per form instance, not per submit, so a
 * double-tapped Save on a slow tablet returns the first acknowledgement instead
 * of raising a second one.
 */
export function DonationForm({
  schoolId,
  schoolYearId,
  programs,
  openPledges,
  presetProgramId,
}: {
  schoolId: string;
  schoolYearId: string;
  programs: DonationProgram[];
  openPledges: PledgeStatusRow[];
  presetProgramId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [programId, setProgramId] = useState(
    presetProgramId && programs.some((p) => p.id === presetProgramId)
      ? presetProgramId
      : (programs[0]?.id ?? ""),
  );
  const [kind, setKind] = useState<DonationKind>("cash");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [remarks, setRemarks] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [donor, setDonor] = useState<DonorSelection>(null);
  const [pledgeId, setPledgeId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; ack: string } | null>(null);

  // Bumped by "Record another". The key is derived from it, so a fresh form
  // gets a fresh key — resetting the fields alone would reuse this one and the
  // RPC would hand back the donation just recorded instead of taking a new one.
  const [nonce, setNonce] = useState(0);
  const idempotencyKey = useMemo(
    () => `donation-${crypto.randomUUID()}`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nonce],
  );

  const program = programs.find((p) => p.id === programId) ?? null;
  const parsedAmount = parseMoneyInput(amount);

  // Only pledges for THIS program, made by THIS donor, can be redeemed —
  // record_donation rejects anything else, so offering it would be a trap.
  const redeemablePledges = useMemo(() => {
    if (anonymous || !donor || donor.kind !== "existing" || !programId) return [];
    return openPledges.filter(
      (p) => p.program_id === programId && p.donor_id === donor.donorId,
    );
  }, [anonymous, donor, programId, openPledges]);

  const canSubmit =
    programId !== "" &&
    parsedAmount > 0 &&
    (kind === "cash" || itemDescription.trim().length >= 3) &&
    (anonymous || donor !== null) &&
    !pending;

  function resetForm() {
    setNonce((n) => n + 1);
    setKind("cash");
    setAmount("");
    setMethod("cash");
    setReference("");
    setItemDescription("");
    setRemarks("");
    setAnonymous(false);
    setDonor(null);
    setPledgeId("");
    setError(null);
    setDone(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await recordDonation({
        schoolYearId,
        programId,
        kind,
        amount: parsedAmount,
        paymentMethod: kind === "cash" ? method : null,
        itemDescription: kind === "in_kind" ? itemDescription.trim() : null,
        donorId:
          !anonymous && donor?.kind === "existing" ? donor.donorId : null,
        donor: !anonymous && donor?.kind === "new" ? donor.donor : null,
        isAnonymous: anonymous,
        pledgeId: pledgeId || null,
        referenceNumber: reference.trim() || null,
        remarks: remarks.trim() || null,
        idempotencyKey,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`Donation recorded — ${result.data.acknowledgementNumber}`);
      setDone({ id: result.data.id, ack: result.data.acknowledgementNumber });
      router.refresh();
    });
  }

  /* ---------------------------------------------------------------------- */

  if (programs.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="font-medium">No open program to donate to</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
            A donation always belongs to a program or activity, so the treasurer
            can report what the money was raised for. Create one first.
          </p>
          <Button asChild className="mt-5">
            <Link href="/donations/programs">Go to programs</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (done) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-success/10">
            <Check className="size-6 text-success" />
          </span>
          <p className="text-base font-medium">Donation recorded</p>
          <p className="mt-1.5 font-mono text-sm text-muted-foreground">
            {done.ack}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href={`/print/donation/${done.id}`}>
                <Printer className="size-4" />
                Print acknowledgement
              </Link>
            </Button>
            <Button variant="outline" onClick={resetForm}>
              Record another
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/donations">Back to donations</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-6">
        {/* ---------------------------------------------------------------- */}
        <section>
          <SectionHeader
            title="What is this for?"
            description="Every donation belongs to a program, so the annual report can say what was raised and for what."
          />
          <Select value={programId} onValueChange={setProgramId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a program" />
            </SelectTrigger>
            <SelectContent>
              {programs.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {program?.description && (
            <p className="mt-2 text-sm text-muted-foreground">
              {program.description}
            </p>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        <section>
          <SectionHeader title="What was given?" />
          <div className="grid gap-3 sm:grid-cols-2">
            <KindOption
              icon={Banknote}
              title="Money"
              hint="Cash, GCash or a bank transfer"
              selected={kind === "cash"}
              onSelect={() => setKind("cash")}
            />
            <KindOption
              icon={Package}
              title="Goods or services"
              hint="Recorded at an estimated value, kept out of cash totals"
              selected={kind === "in_kind"}
              onSelect={() => setKind("in_kind")}
              disabled={program ? !program.accepts_in_kind : false}
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="donation-amount">
                {kind === "cash" ? "Amount received" : "Estimated value"}
              </Label>
              <Input
                id="donation-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="1,500.00"
                className="text-right font-mono tabular-nums"
              />
              {kind === "in_kind" && (
                <p className="text-xs text-muted-foreground">
                  For the record only. This never lands in a cash drawer total.
                </p>
              )}
            </div>

            {kind === "cash" ? (
              <div className="space-y-1.5">
                <Label htmlFor="donation-method">Received as</Label>
                <Select
                  value={method}
                  onValueChange={(v) => setMethod(v as PaymentMethod)}
                >
                  <SelectTrigger id="donation-method" className="w-full">
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
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="donation-item">What was donated</Label>
                <Input
                  id="donation-item"
                  value={itemDescription}
                  onChange={(e) => setItemDescription(e.target.value)}
                  placeholder="20 sacks of cement"
                />
              </div>
            )}
          </div>

          {kind === "cash" && method !== "cash" && (
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="donation-reference">
                Reference number{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Input
                id="donation-reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="GCash or bank reference"
              />
            </div>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        <section>
          <SectionHeader title="Who gave it?" />

          <div className="mb-3 flex items-center justify-between gap-4 rounded-lg border p-3">
            <div className="flex min-w-0 items-center gap-2">
              <UserRoundX className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Anonymous donation</p>
                <p className="text-xs text-muted-foreground">
                  No donor is recorded at all — the money is still counted.
                </p>
              </div>
            </div>
            <Switch
              checked={anonymous}
              onCheckedChange={(v) => {
                setAnonymous(v);
                if (v) {
                  setDonor(null);
                  setPledgeId("");
                }
              }}
            />
          </div>

          {!anonymous && (
            <DonorPicker
              schoolId={schoolId}
              value={donor}
              onChange={(next) => {
                setDonor(next);
                setPledgeId("");
              }}
              disabled={pending}
            />
          )}

          {redeemablePledges.length > 0 && (
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="donation-pledge">
                Redeem a pledge{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Select
                value={pledgeId || "__none__"}
                onValueChange={(v) => setPledgeId(v === "__none__" ? "" : v)}
              >
                <SelectTrigger id="donation-pledge" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    Not against a pledge
                  </SelectItem>
                  {redeemablePledges.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {formatMoney(p.pledged_amount)} pledged —{" "}
                      {formatMoney(p.remaining_amount)} still outstanding
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        <section>
          <Label htmlFor="donation-remarks">
            Remarks{" "}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
          </Label>
          <Textarea
            id="donation-remarks"
            rows={2}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            className="mt-1.5 resize-none"
            placeholder="Anything worth noting on the acknowledgement."
          />
        </section>
      </div>

      {/* ------------------------------------------------------------------ */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {kind === "cash" ? "Amount received" : "Estimated value"}
              </p>
              <p className="mt-1 font-mono text-3xl font-semibold tabular-nums">
                {formatMoney(parsedAmount)}
              </p>
            </div>

            <dl className="space-y-2 border-t pt-4 text-sm">
              <Row label="Program" value={program?.name ?? "—"} />
              <Row
                label="Kind"
                value={kind === "cash" ? "Money" : "Goods or services"}
              />
              <Row
                label="Donor"
                value={
                  anonymous
                    ? "Anonymous"
                    : donor
                      ? donor.kind === "existing"
                        ? donor.label
                        : donor.donor.display_name
                      : "—"
                }
              />
              {pledgeId && (
                <Row
                  label="Redeems"
                  value={
                    <Badge variant="outline" className="text-xs">
                      A standing pledge
                    </Badge>
                  }
                />
              )}
            </dl>

            {kind === "in_kind" && (
              <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                In-kind giving is reported beside cash, never inside it, so the
                day&rsquo;s drawer still reconciles.
              </p>
            )}

            {error && (
              <p className="rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button
              className="w-full"
              onClick={submit}
              disabled={!canSubmit}
              size="lg"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <HandCoins className="size-4" />
              )}
              Record donation
            </Button>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{value}</dd>
    </div>
  );
}

function KindOption({
  icon: Icon,
  title,
  hint,
  selected,
  onSelect,
  disabled,
}: {
  icon: typeof Banknote;
  title: string;
  hint: string;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
          : "hover:bg-muted/50",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg",
          selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-4.5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}
