import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardList, FileText, Receipt, Users, Wallet } from "lucide-react";
import { requireSchool } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getSchoolYears, resolveSchoolYear } from "@/lib/data/school";
import { getStudentProfile } from "@/lib/data/students";
import { formatMoney } from "@/lib/financial/money";
import { formatDate, formatDateTime } from "@/lib/utils/dates";
import { formatNameFull } from "@/lib/utils/names";
import { PageHeader, SectionHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { StudentStatusBadge } from "@/components/common/status-badge";
import { SchoolYearPicker } from "@/components/common/school-year-picker";
import { StudentChargesTable } from "@/components/tables/student-charges-table";
import { PaymentsTable } from "@/components/tables/payments-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function StudentProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sy?: string }>;
}) {
  const ctx = await requireSchool();
  const { id } = await params;
  const { sy } = await searchParams;

  const [schoolYear, schoolYears] = await Promise.all([
    resolveSchoolYear(ctx.activeSchool.id, sy),
    getSchoolYears(ctx.activeSchool.id),
  ]);
  if (!schoolYear) notFound();

  const profile = await getStudentProfile(id, ctx.activeSchool.id, schoolYear.id);
  if (!profile) notFound();

  const { student, enrollment, guardians, charges, payments, totals } = profile;
  const outstanding = charges.filter(
    (c) => c.status === "active" && Number(c.balance) > 0,
  );

  return (
    <>
      <PageHeader
        title={formatNameFull(student)}
        description={[
          enrollment?.grade_level,
          enrollment?.section?.name,
          enrollment?.student_number && `No. ${enrollment.student_number}`,
          student.lrn && `LRN ${student.lrn}`,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <SchoolYearPicker years={schoolYears} current={schoolYear.id} />
            {can(ctx.activeRole, "recordPayment") && outstanding.length > 0 && (
              <Button asChild>
                <Link href={`/collections/new?student=${student.id}`}>
                  <Wallet className="size-4" />
                  Record payment
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StudentStatusBadge status={student.status} />
        {enrollment && enrollment.status !== "enrolled" && (
          <Badge variant="outline">
            Enrollment: {enrollment.status.replace("_", " ")}
          </Badge>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total charges"
          value={formatMoney(totals.charged)}
          icon={ClipboardList}
        />
        <StatCard
          label="Total paid"
          value={formatMoney(totals.paid)}
          tone="positive"
          icon={Wallet}
        />
        <StatCard
          label="Outstanding"
          value={formatMoney(totals.outstanding)}
          tone={totals.outstanding > 0 ? "warning" : "default"}
          icon={FileText}
        />
        <StatCard
          label="Transactions"
          value={totals.transactions.toLocaleString()}
          icon={Receipt}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-8">
          <section>
            <SectionHeader title="Charges" />
            {charges.length === 0 ? (
              <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                No charges assessed for {schoolYear.name}.
              </p>
            ) : (
              <StudentChargesTable
                canWaive={can(ctx.activeRole, "waiveCharge")}
                rows={charges.map((c) => ({
                  id: c.id,
                  fee_type_name: c.fee_type_name,
                  description: c.description,
                  status_reason: c.status_reason,
                  due: c.due_date ? formatDate(c.due_date) : "—",
                  amount: Number(c.amount),
                  waived_amount: Number(c.waived_amount),
                  paid: Number(c.paid),
                  balance: Number(c.balance),
                  status: c.status,
                  payment_status: c.payment_status,
                }))}
              />
            )}
          </section>

          <section>
            <SectionHeader title="Payment history" />
            {payments.length === 0 ? (
              <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                No payments recorded for {schoolYear.name}.
              </p>
            ) : (
              <PaymentsTable
                searchable={false}
                pageSize={0}
                rows={payments.map((p) => ({
                  id: p.id,
                  receipt_number: p.receipt_number,
                  when: formatDateTime(
                    p.payment_date,
                    ctx.activeSchool.timezone,
                  ),
                  student_name: formatNameFull(student),
                  total_amount: Number(p.total_amount),
                  payment_method: p.payment_method,
                  cashier_name: p.collector?.full_name ?? "—",
                  status: p.status,
                }))}
              />
            )}
          </section>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              Parents / Guardians
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {guardians.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No guardian on record.
              </p>
            ) : (
              guardians.map((g) => (
                <div key={g.id} className="py-3 text-sm first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">
                      {g.first_name} {g.last_name}
                    </p>
                    {g.is_primary && <Badge variant="secondary">Primary</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{g.relationship}</p>
                  {g.contact_number && (
                    <p className="font-mono text-xs">{g.contact_number}</p>
                  )}
                  {g.email && <p className="text-xs break-all">{g.email}</p>}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
