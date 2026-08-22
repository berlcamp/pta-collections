import Link from "next/link";
import { Plus, Receipt as ReceiptIcon } from "lucide-react";
import { requireSchool } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getSchoolYears, resolveSchoolYear } from "@/lib/data/school";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { ServerPagination } from "@/components/common/server-pagination";
import { SchoolYearPicker } from "@/components/common/school-year-picker";
import { PaymentsTable } from "@/components/tables/payments-table";
import { formatDateTime } from "@/lib/utils/dates";
import { formatNameListing } from "@/lib/utils/names";
import { PaymentSearchBar } from "@/components/collections/payment-search-bar";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function PaymentHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ sy?: string; q?: string; page?: string }>;
}) {
  const ctx = await requireSchool();
  const { sy, q, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? 1));

  const [schoolYear, schoolYears] = await Promise.all([
    resolveSchoolYear(ctx.activeSchool.id, sy),
    getSchoolYears(ctx.activeSchool.id),
  ]);

  if (!schoolYear) {
    return (
      <>
        <PageHeader title="Payment history" />
        <EmptyState icon={ReceiptIcon} title="No school year yet" />
      </>
    );
  }

  const supabase = await createClient();
  let query = supabase
    .from("payments")
    .select(
      "*, student:students(first_name,middle_name,last_name,suffix), collector:profiles!payments_collected_by_fkey(full_name)",
      { count: "exact" },
    )
    .eq("school_id", ctx.activeSchool.id)
    .eq("school_year_id", schoolYear.id);

  const term = q?.trim();
  if (term) {
    const escaped = term.replace(/[%,()]/g, " ");
    query = query.or(
      `receipt_number.ilike.%${escaped}%,reference_number.ilike.%${escaped}%`,
    );
  }

  const { data, count } = await query
    .order("payment_date", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  type Row = {
    id: string;
    receipt_number: string;
    payment_date: string;
    total_amount: number;
    payment_method: string;
    status: "posted" | "voided";
    student: {
      first_name: string;
      middle_name: string | null;
      last_name: string;
      suffix: string | null;
    } | null;
    collector: { full_name: string } | null;
  };

  const rows = (data ?? []) as unknown as Row[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Payment history"
        description={`${total} receipt${total === 1 ? "" : "s"} · ${schoolYear.name}`}
        actions={
          <>
            <SchoolYearPicker years={schoolYears} current={schoolYear.id} />
            {/* Recording a payment left the sidebar when it collapsed to one
                row per module; it lives with the receipts it creates. */}
            {can(ctx.activeRole, "recordPayment") && (
              <Button asChild>
                <Link href="/collections/new">
                  <Plus className="size-4" />
                  New payment
                </Link>
              </Button>
            )}
          </>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={ReceiptIcon}
          title={term ? "No matching receipts" : "No payments yet"}
          description={
            term
              ? `Nothing matches "${term}".`
              : "Receipts appear here once the first payment is recorded."
          }
        />
      ) : (
        <div className="space-y-4">
          <PaymentsTable
            filters={<PaymentSearchBar />}
            rows={rows.map((r) => ({
              id: r.id,
              receipt_number: r.receipt_number,
              when: formatDateTime(r.payment_date, ctx.activeSchool.timezone),
              student_name: r.student ? formatNameListing(r.student) : "—",
              total_amount: Number(r.total_amount),
              payment_method: r.payment_method,
              cashier_name: r.collector?.full_name ?? "—",
              status: r.status,
            }))}
            /* The receipt search above queries every receipt in the year, so a
               second box that only searched the visible page would mislead. */
            searchable={false}
            pageSize={0}
          />
          <ServerPagination
            page={page}
            pages={pages}
            total={total}
            pageSize={PAGE_SIZE}
            noun="receipt"
          />
        </div>
      )}
    </>
  );
}
