import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { requireSchool } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getReceiptData } from "@/lib/data/payments";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/common/page-header";
import { PaymentStatusBadge } from "@/components/common/status-badge";
import { Receipt } from "@/components/collections/receipt";
import { VoidPaymentDialog } from "@/components/collections/void-payment-dialog";
import { formatDateTime } from "@/lib/utils/dates";

export const dynamic = "force-dynamic";

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireSchool();
  const { id } = await params;

  const data = await getReceiptData(id);
  if (!data || data.school.id !== ctx.activeSchool.id) notFound();

  const { payment } = data;

  return (
    <>
      <PageHeader
        title={payment.receipt_number}
        description={`Recorded ${formatDateTime(payment.payment_date, data.school.timezone)}`}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/collections">
                <ArrowLeft className="size-4" />
                History
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href={`/print/receipt/${id}`} target="_blank">
                <Printer className="size-4" />
                Print receipt
              </Link>
            </Button>
            {payment.status === "posted" && can(ctx.activeRole, "voidPayment") && (
              <VoidPaymentDialog
                paymentId={payment.id}
                receiptNumber={payment.receipt_number}
              />
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <PaymentStatusBadge status={payment.status} />
        {payment.acting_as_super_admin && (
          <span className="text-xs text-muted-foreground">
            Recorded by a Super Admin acting inside this school.
          </span>
        )}
        {payment.status === "voided" && payment.void_reason && (
          <span className="text-xs text-muted-foreground">
            Void reason: {payment.void_reason}
          </span>
        )}
      </div>

      <Card className="overflow-hidden">
        <CardContent className="bg-white p-0">
          <Receipt data={data} />
        </CardContent>
      </Card>
    </>
  );
}
