import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";

import { requireSchool } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getAcknowledgementData } from "@/lib/data/donations";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/common/page-header";
import { MoneyDisplay } from "@/components/common/money-display";
import { VoidDonationDialog } from "@/components/donations/void-donation-dialog";
import { formatDateTime } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  gcash: "GCash",
  bank_transfer: "Bank transfer",
  other: "Other",
};

export default async function DonationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireSchool();
  const { id } = await params;

  const data = await getAcknowledgementData(id);
  if (!data || data.school.id !== ctx.activeSchool.id) notFound();

  const { donation, program, donor, receiver, pledge } = data;
  const voided = donation.status === "voided";

  return (
    <>
      <PageHeader
        title={donation.acknowledgement_number}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {formatDateTime(donation.donation_date, ctx.activeSchool.timezone)}
            <Badge
              variant="outline"
              className={cn(
                "gap-1.5 font-medium",
                voided
                  ? "border-destructive/25 bg-destructive/10 text-destructive"
                  : "border-success/25 bg-success/10 text-success",
              )}
            >
              {voided ? "Voided" : "Posted"}
            </Badge>
          </span>
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`/print/donation/${donation.id}`}>
                <Printer className="size-4" />
                Print acknowledgement
              </Link>
            </Button>
            {!voided && can(ctx.activeRole, "voidDonation") && (
              <VoidDonationDialog
                donationId={donation.id}
                acknowledgementNumber={donation.acknowledgement_number}
              />
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent>
            <dl className="divide-y text-sm">
              <Row
                label={donation.kind === "cash" ? "Amount received" : "Estimated value"}
                value={
                  <MoneyDisplay
                    amount={donation.amount}
                    emphasis
                    className={cn(voided && "line-through")}
                  />
                }
              />
              <Row
                label="Kind"
                value={donation.kind === "cash" ? "Money" : "Goods or services"}
              />
              {donation.kind === "cash" ? (
                <Row
                  label="Received as"
                  value={METHOD_LABELS[donation.payment_method ?? ""] ?? "—"}
                />
              ) : (
                <Row label="What was given" value={donation.item_description} />
              )}
              {donation.reference_number && (
                <Row label="Reference" value={donation.reference_number} />
              )}
              <Row
                label="Program"
                value={
                  <Link
                    href={`/donations/programs/${program.id}`}
                    className="underline underline-offset-2"
                  >
                    {program.name}
                  </Link>
                }
              />
              <Row label="Received by" value={receiver?.full_name ?? "—"} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <dl className="divide-y text-sm">
              <Row
                label="Donor"
                value={
                  donation.is_anonymous ? (
                    <span className="text-muted-foreground italic">
                      Anonymous
                    </span>
                  ) : (
                    (donor?.display_name ?? "—")
                  )
                }
              />
              {donor?.contact_number && (
                <Row label="Contact" value={donor.contact_number} />
              )}
              {donor?.email && <Row label="Email" value={donor.email} />}
              {pledge && (
                <>
                  <Row
                    label="Against pledge of"
                    value={<MoneyDisplay amount={pledge.pledged_amount} />}
                  />
                  <Row
                    label="Pledge still due"
                    value={<MoneyDisplay amount={pledge.remaining_amount} />}
                  />
                </>
              )}
              {donation.remarks && (
                <Row label="Remarks" value={donation.remarks} />
              )}
              {voided && (
                <Row
                  label="Void reason"
                  value={
                    <span className="text-destructive">
                      {donation.void_reason}
                    </span>
                  }
                />
              )}
            </dl>
          </CardContent>
        </Card>
      </div>

      {donation.kind === "in_kind" && (
        <p className="mt-4 rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
          This is a donation in kind. The value shown is an estimate for
          reporting — it is reported beside cash collections, never inside them.
        </p>
      )}
    </>
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
    <div className="flex items-start justify-between gap-6 py-3 first:pt-0 last:pb-0">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{value}</dd>
    </div>
  );
}
