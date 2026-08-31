"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  CreditCard,
  KeyRound,
  Loader2,
  Lock,
  Printer,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

import {
  issueParentCard,
  resetParentPin,
  revokeParentCard,
} from "@/app/actions/parent-cards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

type Issued = { cardNumber: string; pin: string; guardianName: string };

/**
 * Issue, revoke, reset.
 *
 * The card number and the bootstrap PIN are shown EXACTLY ONCE, in the dialog
 * below, and are unrecoverable afterwards — the list masks the number and the
 * PIN exists only as a salted hash. That is deliberate friction: a credential
 * nobody can look up again is a credential nobody can quietly copy off a screen.
 */
export function ParentCardManager({
  issued,
  pending,
  pinRequired,
}: {
  issued: ParentCardDetail[];
  pending: ParentCardPending[];
  /** 0017. Off, the card alone signs in and there is no PIN worth printing. */
  pinRequired: boolean;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [reveal, setReveal] = useState<Issued | null>(null);
  const [revoking, setRevoking] = useState<ParentCardDetail | null>(null);
  const [reason, setReason] = useState("");

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-sm font-medium">
            Awaiting a card{" "}
            <Badge variant="secondary" className="ml-1">
              {pending.length}
            </Badge>
          </h2>

          {pending.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                Every guardian with a child on file holds a card.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="divide-y p-0">
                {pending.map((guardian) => (
                  <div
                    key={guardian.guardian_id}
                    className="flex items-center gap-3 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {guardian.guardian_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {guardian.children}{" "}
                        {guardian.children === 1 ? "child" : "children"}
                        {guardian.contact_number && ` · ${guardian.contact_number}`}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await issueParentCard(guardian.guardian_id);
                          if (!result.ok) {
                      toast.error(result.error);
                      return;
                    }
                          setReveal({
                            cardNumber: result.data.cardNumber,
                            pin: result.data.pin,
                            guardianName: guardian.guardian_name,
                          });
                          router.refresh();
                        })
                      }
                    >
                      {busy ? (
                        <Loader2 className="mr-1.5 size-4 animate-spin" />
                      ) : (
                        <CreditCard className="mr-1.5 size-4" />
                      )}
                      Issue
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium">
            Issued cards{" "}
            <Badge variant="secondary" className="ml-1">
              {issued.length}
            </Badge>
          </h2>

          <Card>
            <CardContent className="divide-y p-0">
              {issued.length === 0 && (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  No parent cards issued yet.
                </p>
              )}
              {issued.map((card) => {
                const locked =
                  card.locked_until && new Date(card.locked_until) > new Date();
                return (
                  <div key={card.id} className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {card.guardian_name}
                      </p>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {card.card_masked}
                        {card.last_login_at
                          ? ` · used ${new Date(card.last_login_at).toLocaleDateString("en-PH")}`
                          : " · never used"}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {card.status === "revoked" && (
                          <Badge variant="destructive" className="text-[10px]">
                            Revoked
                          </Badge>
                        )}
                        {card.must_change_pin && card.status === "active" && (
                          <Badge variant="outline" className="text-[10px]">
                            PIN not set
                          </Badge>
                        )}
                        {locked && (
                          <Badge variant="outline" className="gap-1 text-[10px]">
                            <Lock className="size-2.5" />
                            Locked
                          </Badge>
                        )}
                        {card.telegram_linked && (
                          <Badge variant="secondary" className="text-[10px]">
                            Telegram
                          </Badge>
                        )}
                      </div>
                    </div>

                    {card.status === "active" && (
                      <div className="flex shrink-0 gap-1">
                        {pinRequired && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Reset PIN"
                          disabled={busy}
                          onClick={() =>
                            startTransition(async () => {
                              const result = await resetParentPin(card.id);
                              if (!result.ok) {
                      toast.error(result.error);
                      return;
                    }
                              setReveal({
                                cardNumber: "",
                                pin: result.data.pin,
                                guardianName: card.guardian_name,
                              });
                              router.refresh();
                            })
                          }
                        >
                          <KeyRound className="size-4" />
                        </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Revoke card"
                          onClick={() => {
                            setRevoking(card);
                            setReason("");
                          }}
                        >
                          <ShieldAlert className="size-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </section>
      </div>

      {/* Shown once. There is no way back to either value afterwards. */}
      <Dialog open={Boolean(reveal)} onOpenChange={() => setReveal(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {reveal?.cardNumber ? "Parent card issued" : "PIN reset"}
            </DialogTitle>
            <DialogDescription>
              Write {pinRequired ? "these" : "this"} down or print now — it
              cannot be shown again.
            </DialogDescription>
          </DialogHeader>

          {reveal && (
            <div id="parent-card-slip" className="space-y-4 text-center">
              <p className="text-sm font-medium">{reveal.guardianName}</p>
              {/* Print-only: the slip is handed to a parent who has never seen
                  this system, so it has to explain itself off the page. */}
              <p className="hidden text-xs text-muted-foreground print:block">
                Parent Portal sign-in. Keep this slip — it cannot be shown again.
                {pinRequired &&
                  " Change the PIN the first time you sign in."}
              </p>

              {reveal.cardNumber && (
                <>
                  <div
                    className="mx-auto text-foreground"
                    // Hand-rolled Code 128-C from lib/barcode.ts — no dependency,
                    // covered by tests/barcode.test.ts.
                    dangerouslySetInnerHTML={{
                      __html: code128Svg(reveal.cardNumber, { moduleWidth: 2 }),
                    }}
                  />
                  <p className="font-mono text-lg tracking-widest">
                    {formatCardNumber(reveal.cardNumber)}
                  </p>
                </>
              )}

              {/* A PIN is still minted and stored either way, so turning the
                  setting on later needs no reissue — it is simply not printed
                  on a slip for a school that does not use one. */}
              {pinRequired && (
                <div className="rounded-lg border bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Temporary PIN</p>
                  <p className="font-mono text-3xl font-semibold tracking-[0.3em]">
                    {reveal.pin}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The parent must change this on first sign-in.
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-1.5 size-4" />
              Print
            </Button>
            <Button onClick={() => setReveal(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              disabled={busy || reason.trim().length < 3}
              onClick={() =>
                startTransition(async () => {
                  const result = await revokeParentCard({
                    accountId: revoking!.id,
                    reason,
                  });
                  if (!result.ok) {
                      toast.error(result.error);
                      return;
                    }
                  toast.success("Card revoked.");
                  setRevoking(null);
                  router.refresh();
                })
              }
            >
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
