"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { IdCard, Loader2, Printer, UserRoundPlus } from "lucide-react";
import { toast } from "sonner";

import {
  issueParentCard,
  resetParentPin,
  revealParentCard,
  revokeParentCard,
} from "@/app/actions/parent-cards";
import { EmptyState } from "@/components/common/empty-state";
import { SectionHeader } from "@/components/common/page-header";
import {
  IssuedCardsTable,
  PendingCardsTable,
  type CardBusy,
} from "@/components/tables/parent-cards-table";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { code128Svg } from "@/lib/barcode";
import { formatCardNumber } from "@/lib/portal/card";
import type {
  ParentCardDetail,
  ParentCardPending,
} from "@/types/database.types";

/**
 * What the slip dialog is showing.
 *
 *   issued  — a brand new card and its bootstrap PIN, shown once
 *   reset   — a new PIN for a card already in the parent's hands
 *   reprint — the number of an existing card, read back by a super admin
 *
 * The three differ in what may be printed and in what the dialog is allowed to
 * claim: only `issued` may say "this cannot be shown again".
 */
type Slip = {
  cardNumber: string;
  pin: string;
  guardianName: string;
  mode: "issued" | "reset" | "reprint";
};

/**
 * Issue, revoke, reset.
 *
 * The card number and the bootstrap PIN are shown EXACTLY ONCE, in the dialog
 * below, and are unrecoverable afterwards — the list masks the number and the
 * PIN exists only as a salted hash. That is deliberate friction: a credential
 * nobody can look up again is a credential nobody can quietly copy off a screen.
 *
 * The lists themselves are in components/tables/parent-cards-table.tsx. This
 * component owns only what a table cannot: the two dialogs, and which row is
 * mid-flight.
 */
export function ParentCardManager({
  issued,
  pending,
  pinRequired,
  timezone,
  canReveal,
}: {
  issued: ParentCardDetail[];
  pending: ParentCardPending[];
  /** 0017. Off, the card alone signs in and there is no PIN worth printing. */
  pinRequired: boolean;
  timezone: string;
  /** 0020. Super admin only: read an issued number back, to reprint a slip. */
  canReveal: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<CardBusy>(null);
  const [slip, setSlip] = useState<Slip | null>(null);
  const [issuing, setIssuing] = useState<ParentCardPending | null>(null);
  const [revoking, setRevoking] = useState<ParentCardDetail | null>(null);
  const [reason, setReason] = useState("");

  // A reprint carries no PIN — there is none to carry, only a hash.
  const showPin = pinRequired && slip !== null && slip.mode !== "reprint";

  const handleIssue = (guardian: ParentCardPending) => {
    setIssuing(null);
    setBusy({ id: guardian.guardian_id, verb: "issue" });
    startTransition(async () => {
      const result = await issueParentCard(guardian.guardian_id);
      setBusy(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSlip({
        cardNumber: result.data.cardNumber,
        pin: result.data.pin,
        guardianName: guardian.guardian_name,
        mode: "issued",
      });
      router.refresh();
    });
  };

  const handleResetPin = (card: ParentCardDetail) => {
    setBusy({ id: card.id, verb: "reset" });
    startTransition(async () => {
      const result = await resetParentPin(card.id);
      setBusy(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSlip({
        cardNumber: "",
        pin: result.data.pin,
        guardianName: card.guardian_name,
        mode: "reset",
      });
      router.refresh();
    });
  };

  // 0020. Reading the number back is a super-admin verb and an audited event,
  // not a lookup — hence the round trip rather than a column on the list.
  const handleReveal = (card: ParentCardDetail) => {
    setBusy({ id: card.id, verb: "reveal" });
    startTransition(async () => {
      const result = await revealParentCard(card.id);
      setBusy(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSlip({
        cardNumber: result.data.cardNumber,
        pin: "",
        guardianName: result.data.guardianName,
        mode: "reprint",
      });
    });
  };

  return (
    <>
      <div className="mt-8">
        <SectionHeader
          title="Awaiting a card"
          description="Guardians with a child on file who cannot reach the portal yet. Issuing shows the number once."
        />
        {pending.length === 0 ? (
          <EmptyState
            icon={UserRoundPlus}
            title="Everyone has a card"
            description="Every guardian with a child on file at this school already holds one."
          />
        ) : (
          <PendingCardsTable
            rows={pending}
            busy={busy}
            onIssue={setIssuing}
          />
        )}
      </div>

      <div className="mt-8">
        <SectionHeader
          title="Issued cards"
          description="Revoking signs the parent out immediately, even mid session. Nothing is deleted."
        />
        {issued.length === 0 ? (
          <EmptyState
            icon={IdCard}
            title="No parent cards issued yet"
            description="Nobody at this school can sign in to the Parent Portal until somebody is handed a card."
          />
        ) : (
          <IssuedCardsTable
            rows={issued}
            timezone={timezone}
            pinRequired={pinRequired}
            busy={busy}
            canReveal={canReveal}
            onReveal={handleReveal}
            onResetPin={handleResetPin}
            onRevoke={(card) => {
              setRevoking(card);
              setReason("");
            }}
          />
        )}
      </div>

      {/* Three slips in one dialog — see the Slip type. Only an issuance may
          claim the values cannot be shown again, and only a super admin can
          ever make that claim false. */}
      <Dialog open={Boolean(slip)} onOpenChange={() => setSlip(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {slip?.mode === "issued"
                ? "Parent card issued"
                : slip?.mode === "reset"
                  ? "PIN reset"
                  : "Parent card"}
            </DialogTitle>
            <DialogDescription>
              {slip?.mode === "reprint"
                ? "The number already on this parent's card. Reprint the slip and hand it over — the card itself keeps working."
                : `Write ${showPin ? "these" : "this"} down or print now — it cannot be shown again.`}
            </DialogDescription>
          </DialogHeader>

          {slip && (
            <div id="parent-card-slip" className="space-y-4 text-center">
              <p className="text-sm font-medium">{slip.guardianName}</p>
              {/* Print-only: the slip is handed to a parent who has never seen
                  this system, so it has to explain itself off the page. */}
              <p className="hidden text-xs text-muted-foreground print:block">
                Parent Portal sign-in. Keep this slip.
                {showPin && " Change the PIN the first time you sign in."}
              </p>

              {slip.cardNumber && (
                <>
                  <div
                    className="mx-auto text-foreground"
                    // Hand-rolled Code 128-C from lib/barcode.ts — no dependency,
                    // covered by tests/barcode.test.ts.
                    dangerouslySetInnerHTML={{
                      __html: code128Svg(slip.cardNumber, { moduleWidth: 2 }),
                    }}
                  />
                  <p className="font-mono text-lg tracking-widest">
                    {formatCardNumber(slip.cardNumber)}
                  </p>
                </>
              )}

              {/* A PIN is still minted and stored either way, so turning the
                  setting on later needs no reissue — it is simply not printed
                  on a slip for a school that does not use one. A reprint has no
                  PIN at all: it exists only as a hash, so Reset PIN is still
                  the only answer to a forgotten one. */}
              {showPin && (
                <div className="rounded-lg border bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Temporary PIN</p>
                  <p className="font-mono text-3xl font-semibold tracking-[0.3em]">
                    {slip.pin}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The parent must change this on first sign-in.
                  </p>
                </div>
              )}

              {slip.mode === "reprint" && pinRequired && (
                <p className="text-xs text-muted-foreground print:hidden">
                  The PIN cannot be shown — it is stored only as a hash. If the
                  parent has forgotten theirs, use Reset PIN.
                </p>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-1.5 size-4" />
              Print
            </Button>
            <Button onClick={() => setSlip(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Issuing is an identity decision and a one-way one: the number appears
          once, the guardian can never be issued a second card, and undoing it
          means revoking. Worth a beat before the click lands. */}
      <AlertDialog
        open={issuing !== null}
        onOpenChange={(open) => !open && setIssuing(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Issue a parent card to {issuing?.guardian_name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They will be able to sign in to the Parent Portal and see the gate
              arrivals, balances and payments of{" "}
              {issuing?.children === 1
                ? "their child"
                : `all ${issuing?.children} of their children`}
              . The number{pinRequired ? " and a temporary PIN" : ""} appear on
              the next screen — print the slip before closing it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy !== null}
              onClick={(e) => {
                e.preventDefault();
                if (issuing) handleIssue(issuing);
              }}
            >
              {busy !== null && <Loader2 className="size-4 animate-spin" />}
              Issue card
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={Boolean(revoking)} onOpenChange={() => setRevoking(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Revoke this card?</DialogTitle>
            <DialogDescription>
              {revoking?.guardian_name} will be signed out immediately, even mid
              session, and the card cannot be used again. Issue a new one
              afterwards if it was simply lost.
            </DialogDescription>
          </DialogHeader>

          <Input
            autoFocus
            placeholder="Reason — it goes in the audit log"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />

          <DialogFooter>
            <Button variant="ghost" onClick={() => setRevoking(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy !== null || reason.trim().length < 3}
              onClick={() => {
                const card = revoking;
                if (!card) return;
                setBusy({ id: card.id, verb: "revoke" });
                startTransition(async () => {
                  const result = await revokeParentCard({
                    accountId: card.id,
                    reason,
                  });
                  setBusy(null);
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  toast.success("Card revoked.");
                  setRevoking(null);
                  router.refresh();
                });
              }}
            >
              {busy !== null && <Loader2 className="mr-2 size-4 animate-spin" />}
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
