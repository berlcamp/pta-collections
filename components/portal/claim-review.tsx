"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { approveClaim, rejectClaim } from "@/app/actions/claims";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { peso } from "@/lib/portal/i18n";
import type { PaymentClaimDetail } from "@/types/database.types";

/**
 * One claim, reviewed.
 *
 * Approving calls create_payment() / record_donation() under the hood, so the
 * money lands in the same receipt series and the same daily total as anything
 * taken at the counter — and `collected_by` becomes the person clicking this
 * button, because they are the one attesting the transfer arrived.
 */
export function ClaimReview({
  claim,
  proofUrl,
}: {
  claim: PaymentClaimDetail;
  proofUrl: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const blocked = claim.claim_type === "fee" && !claim.student_is_enrolled;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{claim.guardian_name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {claim.claim_type === "fee"
                ? [claim.student_name, claim.grade_level, claim.section_name]
                    .filter(Boolean)
                    .join(" · ")
                : claim.program_name}
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-lg font-semibold tabular-nums">
              {peso(claim.claimed_amount)}
            </p>
            <Badge variant="outline" className="mt-0.5 text-[10px] uppercase">
              {claim.claim_type}
            </Badge>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-3 text-xs">
          <div>
            <dt className="text-muted-foreground">Reference</dt>
            <dd className="font-mono font-medium">{claim.reference_number}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Submitted</dt>
            <dd>
              {new Date(claim.created_at).toLocaleString("en-PH", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Asia/Manila",
              })}
            </dd>
          </div>
          {claim.guardian_contact && (
            <div>
              <dt className="text-muted-foreground">Contact</dt>
              <dd className="font-mono">{claim.guardian_contact}</dd>
            </div>
          )}
          <div>
            <dt className="text-muted-foreground">Method</dt>
            <dd className="uppercase">{claim.payment_method}</dd>
          </div>
        </dl>

        {/* Surfaced by v_payment_claims_detail so the reviewer is not the one
            who discovers, mid-approval, that create_payment() is about to fail
            on the enrollment FK. */}
        {blocked && (
          <p className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            This student has no active enrollment for the claim&apos;s school
            year, so this cannot be posted. Reject it and settle at the counter.
          </p>
        )}

        {proofUrl && (
          <a
            href={proofUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-lg border"
          >
            {/* Not next/image: a signed storage URL expires, and the optimizer
                would cache a dead one. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={proofUrl}
              alt="Proof of payment"
              className="max-h-64 w-full object-contain bg-muted"
            />
          </a>
        )}

        {rejecting ? (
          <div className="space-y-2">
            <Textarea
              autoFocus
              rows={2}
              placeholder="What should the parent fix? They will read this."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setRejecting(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={pending || reason.trim().length < 5}
                onClick={() =>
                  startTransition(async () => {
                    const result = await rejectClaim({
                      claimId: claim.id,
                      reason,
                    });
                    if (!result.ok) {
                      toast.error(result.error);
                      return;
                    }
                    toast.success("Claim rejected. The parent has been told why.");
                    setRejecting(false);
                    router.refresh();
                  })
                }
              >
                {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Reject
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={pending}
              onClick={() => setRejecting(true)}
            >
              <X className="mr-1.5 size-4" />
              Reject
            </Button>
            <Button
              className="flex-1"
              disabled={pending || blocked}
              onClick={() =>
                startTransition(async () => {
                  const result = await approveClaim(claim.id);
                  if (!result.ok) {
                      toast.error(result.error);
                      return;
                    }
                  toast.success(
                    result.data.receiptNumber
                      ? `Posted. Receipt ${result.data.receiptNumber}.`
                      : "Posted.",
                  );
                  router.refresh();
                })
              }
            >
              {pending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Check className="mr-1.5 size-4" />
              )}
              Confirm &amp; post
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
