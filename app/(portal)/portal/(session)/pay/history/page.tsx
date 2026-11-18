import { Clock, HeartHandshake, Receipt, XCircle } from "lucide-react";

import {
  EmptyState,
  PortalScreen,
  PortalTopBar,
  SectionTitle,
} from "@/components/portal/screen";
import { portalCard } from "@/components/portal/styles";
import { getPortalClaims, getPortalPayments } from "@/lib/data/portal";
import { peso, t } from "@/lib/portal/i18n";
import { requirePortalSession } from "@/lib/portal/session";
import { cn } from "@/lib/utils";
import type { PortalClaim, PortalPayment } from "@/types/database.types";

export const dynamic = "force-dynamic";

/**
 * Payment history.
 *
 * Three groups, in the order a parent worries about them:
 *
 *  - WAITING: GCash claims the school has not checked yet.
 *  - NOT ACCEPTED: claims the school refused, with the reason.
 *  - RECEIPTS: every official receipt for their children — counter and portal
 *    alike, because an approved fee claim runs through create_payment() and
 *    becomes an ordinary payment — plus the acknowledgement for each confirmed
 *    online donation, which is a separate series and never a payment.
 *
 * An approved FEE claim is deliberately not listed as a claim as well: its
 * receipt is already in the third group, and showing both reads as paying
 * twice.
 */
export default async function PortalPaymentHistoryPage() {
  const session = await requirePortalSession();
  const copy = t(session.locale);

  const [claims, payments] = await Promise.all([
    getPortalClaims(),
    getPortalPayments(),
  ]);

  const waiting = claims.filter((c) => c.status === "submitted");
  const refused = claims.filter((c) => c.status === "rejected");

  type Row =
    | { kind: "payment"; at: string; payment: PortalPayment }
    | { kind: "donation"; at: string; claim: PortalClaim };

  const receipts: Row[] = [
    ...payments.map((payment) => ({
      kind: "payment" as const,
      at: payment.payment_date,
      payment,
    })),
    ...claims
      .filter((c) => c.status === "approved" && c.claim_type === "donation")
      .map((claim) => ({
        kind: "donation" as const,
        at: claim.reviewed_at ?? claim.created_at,
        claim,
      })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const empty = waiting.length === 0 && refused.length === 0 && receipts.length === 0;

  return (
    <PortalScreen
      hero={
        <PortalTopBar
          backHref="/portal/pay"
          backLabel={copy.back}
          title={copy.payHistory}
        />
      }
    >
      {empty && <EmptyState icon={Receipt}>{copy.noClaims}</EmptyState>}

      {waiting.length > 0 && (
        <>
          <SectionTitle>{copy.inReview}</SectionTitle>
          <ul className={cn(portalCard, "divide-y divide-slate-100 overflow-hidden")}>
            {waiting.map((claim) => (
              <Row
                key={claim.id}
                icon={Clock}
                tone="amber"
                title={claim.student_name ?? claim.program_name ?? copy.donation}
                meta={`${formatDate(claim.created_at)} · GCash ${claim.reference_number}`}
                amount={peso(claim.claimed_amount)}
                status={copy.claimSubmittedStatus}
              />
            ))}
          </ul>
        </>
      )}

      {refused.length > 0 && (
        <>
          <SectionTitle>{copy.notAccepted}</SectionTitle>
          <ul className={cn(portalCard, "divide-y divide-slate-100 overflow-hidden")}>
            {refused.map((claim) => (
              <Row
                key={claim.id}
                icon={XCircle}
                tone="red"
                title={claim.student_name ?? claim.program_name ?? copy.donation}
                meta={`${formatDate(claim.created_at)} · GCash ${claim.reference_number}`}
                amount={peso(claim.claimed_amount)}
                status={copy.claimRejected}
                note={claim.review_reason}
              />
            ))}
          </ul>
        </>
      )}

      {receipts.length > 0 && (
        <>
          <SectionTitle>{copy.receipts}</SectionTitle>
          <ul className={cn(portalCard, "divide-y divide-slate-100 overflow-hidden")}>
            {receipts.map((row) =>
              row.kind === "payment" ? (
                <Row
                  key={`p-${row.payment.payment_id}`}
                  icon={Receipt}
                  tone={row.payment.status === "voided" ? "slate" : "green"}
                  title={row.payment.student_name}
                  meta={`${formatDate(row.payment.payment_date)} · ${copy.receiptNo} ${row.payment.receipt_number}`}
                  amount={peso(row.payment.total_amount)}
                  struck={row.payment.status === "voided"}
                  status={
                    row.payment.status === "voided"
                      ? copy.voided
                      : methodLabel(row.payment.payment_method)
                  }
                />
              ) : (
                <Row
                  key={`d-${row.claim.id}`}
                  icon={HeartHandshake}
                  tone="blue"
                  title={row.claim.program_name ?? copy.donation}
                  meta={`${formatDate(row.at)}${
                    row.claim.acknowledgement_number
                      ? ` · ${copy.ackNo} ${row.claim.acknowledgement_number}`
                      : ""
                  }`}
                  amount={peso(row.claim.claimed_amount)}
                  status={copy.donation}
                />
              ),
            )}
          </ul>
        </>
      )}
    </PortalScreen>
  );
}

const TONES = {
  amber: "bg-amber-50 text-amber-600",
  red: "bg-red-50 text-red-600",
  green: "bg-emerald-50 text-emerald-600",
  blue: "bg-blue-50 text-blue-600",
  slate: "bg-slate-100 text-slate-400",
} as const;

function Row({
  icon: Icon,
  tone,
  title,
  meta,
  amount,
  status,
  note,
  struck,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: keyof typeof TONES;
  title: string;
  meta: string;
  amount: string;
  status: string;
  note?: string | null;
  struck?: boolean;
}) {
  return (
    <li className="px-4 py-3.5">
      <div className="flex items-center gap-3">
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-2xl", TONES[tone])}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.95rem] font-medium text-slate-900">{title}</p>
          <p className="truncate font-mono text-xs text-slate-500">{meta}</p>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={cn(
              "font-mono text-[0.95rem] font-semibold tabular-nums",
              struck ? "text-slate-400 line-through" : "text-slate-900",
            )}
          >
            {amount}
          </p>
          <p className="text-[0.7rem] font-medium text-slate-500">{status}</p>
        </div>
      </div>
      {note && (
        <p className="mt-2.5 rounded-xl bg-red-50 p-3 text-xs leading-relaxed text-red-700">
          {note}
        </p>
      )}
    </li>
  );
}

/** A timestamp shown as a date in the school's own time zone. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Manila",
  });
}

function methodLabel(method: PortalPayment["payment_method"]): string {
  switch (method) {
    case "gcash":
      return "GCash";
    case "bank_transfer":
      return "Bank";
    case "cash":
      return "Cash";
    default:
      return "Other";
  }
}
