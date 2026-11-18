"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Loader2, Merge, UserRound, X } from "lucide-react";
import { toast } from "sonner";

import { dismissDuplicate, mergeGuardians } from "@/app/actions/guardians";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type {
  GuardianDuplicatePair,
  GuardianDuplicateSide,
} from "@/lib/data/guardians";

const REASON: Record<string, string> = {
  same_number: "Same mobile number",
  same_name: "Same name",
  similar_name: "Similar name",
};

function hasLiveCard(s: GuardianDuplicateSide) {
  return s.card?.status === "active";
}

/**
 * The record to keep by default: the one whose parent card is in use. Merging
 * away the only card is refused in SQL (0027), and the parent would have to
 * be handed a new one anyway. Otherwise, whoever has more children.
 */
function defaultKeep(p: GuardianDuplicatePair): "a" | "b" {
  if (p.a.card && !p.b.card) return "a";
  if (p.b.card && !p.a.card) return "b";
  if (hasLiveCard(p.a) !== hasLiveCard(p.b)) return hasLiveCard(p.a) ? "a" : "b";
  const count = (s: GuardianDuplicateSide) => (s.children ? s.children.split(",").length : 0);
  return count(p.b) > count(p.a) ? "b" : "a";
}

export function DuplicatePairCard({ pair }: { pair: GuardianDuplicatePair }) {
  const router = useRouter();
  const [keep, setKeep] = useState<"a" | "b">(defaultKeep(pair));
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const kept = keep === "a" ? pair.a : pair.b;
  const gone = keep === "a" ? pair.b : pair.a;
  const cardBlocked = Boolean(gone.card && !kept.card);

  function merge() {
    startTransition(async () => {
      const res = await mergeGuardians({ keepId: kept.id, mergeId: gone.id });
      setOpen(false);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const d = res.data;
      toast.success(
        [
          `Merged into ${kept.name}.`,
          d.children_moved + d.children_shared > 0 &&
            `${d.children_moved + d.children_shared} child${
              d.children_moved + d.children_shared === 1 ? "" : "ren"
            } now under one parent.`,
          d.card_revoked_last4 && `Card ending ${d.card_revoked_last4} revoked.`,
          d.telegram_moved && "Telegram moved over.",
        ]
          .filter(Boolean)
          .join(" "),
      );
      router.refresh();
    });
  }

  function dismiss() {
    startTransition(async () => {
      const res = await dismissDuplicate({ a: pair.a.id, b: pair.b.id });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Marked as two different people.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {pair.reasons.map((r) => (
            <Badge key={r} variant="secondary">
              {REASON[r] ?? r}
            </Badge>
          ))}
        </div>

        <div role="radiogroup" aria-label="Record to keep" className="grid gap-3 sm:grid-cols-2">
          {(["a", "b"] as const).map((side) => (
            <Side
              key={side}
              record={pair[side]}
              selected={keep === side}
              onSelect={() => setKeep(side)}
              disabled={pending}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Pick the record to keep. The other one&apos;s children, Telegram and donor
            history move onto it.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={dismiss} disabled={pending}>
              <X className="size-3.5" />
              Not the same person
            </Button>
            <Button
              size="sm"
              onClick={() => setOpen(true)}
              disabled={pending || cardBlocked}
              title={
                cardBlocked
                  ? "The other record holds the parent card — keep that one instead."
                  : undefined
              }
            >
              <Merge className="size-3.5" />
              Merge
            </Button>
          </div>
        </div>
        {cardBlocked && (
          <p className="text-xs text-destructive">
            {gone.name} holds the parent card, so keep that record instead.
          </p>
        )}
      </CardContent>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Merge into {kept.name}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  {gone.children
                    ? `${gone.children} will be linked to ${kept.name}.`
                    : `${gone.name} has no children to move.`}
                </p>
                {gone.card?.status === "active" && (
                  <p>
                    The parent card {gone.card.masked} stops working. The family keeps
                    using {kept.card?.masked ?? "the kept record's card"}.
                  </p>
                )}
                <p>This cannot be undone from the screen.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                merge();
              }}
              disabled={pending}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Merge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function Side({
  record,
  selected,
  onSelect,
  disabled,
}: {
  record: GuardianDuplicateSide;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        "rounded-lg border p-4 text-left transition-colors",
        selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <UserRound className="size-4 text-muted-foreground" />
          {record.name}
        </p>
        {selected && <Badge>Keep</Badge>}
      </div>
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        {record.contact ?? "No number"}
      </p>
      <p className="mt-2 text-xs">
        {record.children ? (
          <>
            <span className="text-muted-foreground">Children: </span>
            {record.children}
          </>
        ) : (
          <span className="text-muted-foreground">No children linked</span>
        )}
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <CreditCard className="size-3.5" />
        {record.card
          ? `${record.card.masked}${record.card.status === "active" ? "" : ` (${record.card.status})`}`
          : "No parent card"}
      </p>
    </button>
  );
}
