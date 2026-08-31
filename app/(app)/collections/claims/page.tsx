import { Inbox } from "lucide-react";

import { ClaimReview } from "@/components/portal/claim-review";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { peso } from "@/lib/portal/i18n";
import type { PaymentClaimDetail } from "@/types/database.types";

export const dynamic = "force-dynamic";

/**
 * Online payments awaiting confirmation.
 *
 * A parent asserting they sent money is not money. Nothing on this page has
 * touched pta.payments, consumed a receipt number, or moved a balance — that
 * all happens the moment someone here clicks Confirm, having checked the
 * reference against the GCash app.
 */
export default async function ClaimsQueuePage() {
  const { activeSchool } = await requireRole([
    "admin",
    "cashier",
    "treasurer",
  ]);

  const supabase = await createClient();
  const { data } = await supabase
    .from("v_payment_claims_detail")
    .select("*")
    .eq("school_id", activeSchool!.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const claims = (data ?? []) as PaymentClaimDetail[];
  const pending = claims.filter((c) => c.status === "submitted");
  const settled = claims.filter((c) => c.status !== "submitted").slice(0, 20);

  // Signed one at a time. The staff read policy on pta-payment-proofs is scoped
  // to this school's folder, so a URL only mints for a claim they may see.
  const proofs = new Map<string, string>();
  for (const claim of pending) {
    if (!claim.proof_path) continue;
    const { data: signed } = await supabase.storage
      .from("pta-payment-proofs")
      .createSignedUrl(claim.proof_path, 600);
    if (signed?.signedUrl) proofs.set(claim.id, signed.signedUrl);
  }

  const total = pending.reduce((sum, c) => sum + Number(c.claimed_amount), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Online payments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            GCash transfers parents say they have sent. Check each reference in
            the GCash app before confirming — confirming issues a real receipt.
          </p>
        </div>
        {pending.length > 0 && (
          <Badge variant="secondary" className="font-mono">
            {pending.length} waiting · {peso(total)}
          </Badge>
        )}
      </div>

      {pending.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <Inbox className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nothing waiting. Every submitted payment has been reviewed.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {pending.map((claim) => (
            <ClaimReview
              key={claim.id}
              claim={claim}
              proofUrl={proofs.get(claim.id) ?? null}
            />
          ))}
        </div>
      )}

      {settled.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Recently reviewed
          </h2>
          <Card>
            <CardContent className="divide-y p-0">
              {settled.map((claim) => (
                <div key={claim.id} className="flex items-center gap-3 p-3 text-sm">
                  <Badge
                    variant={claim.status === "approved" ? "secondary" : "outline"}
                    className="shrink-0"
                  >
                    {claim.status}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate">
                    {claim.guardian_name} · {claim.student_name ?? claim.program_name}
                  </span>
                  <span className="font-mono tabular-nums">
                    {peso(claim.claimed_amount)}
                  </span>
                  {claim.receipt_number && (
                    <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
                      {claim.receipt_number}
                    </span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
