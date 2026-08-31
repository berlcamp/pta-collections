import { CheckCircle2, Clock, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getPortalClaims, getPortalPayments } from "@/lib/data/portal";
import { peso, t } from "@/lib/portal/i18n";
import { requirePortalSession } from "@/lib/portal/session";

export const dynamic = "force-dynamic";

export default async function PortalClaimsPage() {
  const session = await requirePortalSession();
  const copy = t(session.locale);

  const [claims, payments] = await Promise.all([
    getPortalClaims(),
    getPortalPayments(),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">{copy.claimsTitle}</h1>

      {claims.length === 0 && payments.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            {copy.noClaims}
          </CardContent>
        </Card>
      )}

      {claims.map((claim) => {
        const icon =
          claim.status === "approved" ? (
            <CheckCircle2 className="size-4 text-emerald-600" />
          ) : claim.status === "rejected" ? (
            <XCircle className="size-4 text-destructive" />
          ) : (
            <Clock className="size-4 text-amber-600" />
          );

        return (
          <Card key={claim.id}>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {claim.student_name ?? claim.program_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(claim.created_at).toLocaleDateString("en-PH", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      timeZone: "Asia/Manila",
                    })}{" "}
                    · {claim.reference_number}
                  </p>
                </div>
                <span className="font-mono text-lg font-semibold tabular-nums">
                  {peso(claim.claimed_amount)}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="gap-1.5">
                  {icon}
                  {claim.status === "approved"
                    ? copy.claimApproved
                    : claim.status === "rejected"
                      ? copy.claimRejected
                      : copy.claimSubmittedStatus}
                </Badge>

                {/* The receipt series is the SAME one the counter issues — an
                    approved claim runs through create_payment(), so this is a
                    real OR number the parent can quote at the office. */}
                {claim.receipt_number && (
                  <Badge variant="secondary" className="font-mono">
                    {copy.receiptNo} {claim.receipt_number}
                  </Badge>
                )}
                {claim.acknowledgement_number && (
                  <Badge variant="secondary" className="font-mono">
                    {copy.ackNo} {claim.acknowledgement_number}
                  </Badge>
                )}
              </div>

              {claim.status === "rejected" && claim.review_reason && (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                  {claim.review_reason}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
