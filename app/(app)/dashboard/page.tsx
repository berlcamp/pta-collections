import { redirect } from "next/navigation";
import {
  Banknote,
  CalendarDays,
  GraduationCap,
  Receipt,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { resolveSchoolYear } from "@/lib/data/school";
import { formatMoney } from "@/lib/financial/money";
import { todayInTimezone, startOfMonthInTimezone } from "@/lib/utils/dates";
import { PageHeader, SectionHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { CollectionCharts } from "@/components/reports/collection-charts";
import { SchoolYearPicker } from "@/components/common/school-year-picker";
import { getSchoolYears } from "@/lib/data/school";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ sy?: string }>;
}) {
  const session = await requireSession();

  // A Super Admin with no school selected gets the GLOBAL dashboard, never an
  // arbitrary school's data.
  if (!session.activeSchool) {
    redirect(session.isSuperAdmin ? "/super" : "/no-access");
  }

  const school = session.activeSchool;
  const { sy } = await searchParams;
  const [schoolYear, schoolYears] = await Promise.all([
    resolveSchoolYear(school.id, sy),
    getSchoolYears(school.id),
  ]);

  if (!schoolYear) {
    return (
      <>
        <PageHeader title={school.name} description="School dashboard" />
        <EmptyState
          icon={CalendarDays}
          title="No school year yet"
          description="Create a school year before enrolling students or assessing fees."
          action={
            <Button asChild>
              <Link href="/admin/school-years">Create a school year</Link>
            </Button>
          }
        />
      </>
    );
  }

  const supabase = await createClient();
  const today = todayInTimezone(school.timezone);
  const monthStart = startOfMonthInTimezone(school.timezone);

  const [enrollments, financials, daily, byFeeType] = await Promise.all([
    supabase
      .from("student_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("school_id", school.id)
      .eq("school_year_id", schoolYear.id)
      .eq("status", "enrolled"),
    supabase
      .from("v_student_financials")
      .select("total_charged,total_paid,outstanding")
      .eq("school_id", school.id)
      .eq("school_year_id", schoolYear.id),
    supabase
      .from("v_daily_collections")
      .select("collection_date,payment_method,total,receipt_count")
      .eq("school_id", school.id)
      .eq("school_year_id", schoolYear.id)
      .order("collection_date"),
    supabase
      .from("v_collections_by_fee_type")
      .select("fee_type_name,total")
      .eq("school_id", school.id)
      .eq("school_year_id", schoolYear.id),
  ]);

  type Fin = { total_charged: number; total_paid: number; outstanding: number };
  const fin = (financials.data ?? []) as Fin[];
  const totalCharged = fin.reduce((s, r) => s + Number(r.total_charged), 0);
  const totalPaid = fin.reduce((s, r) => s + Number(r.total_paid), 0);
  const outstanding = fin.reduce((s, r) => s + Number(r.outstanding), 0);
  const unpaidStudents = fin.filter((r) => Number(r.outstanding) > 0).length;

  type Daily = {
    collection_date: string;
    payment_method: string;
    total: number;
    receipt_count: number;
  };
  const dailyRows = (daily.data ?? []) as Daily[];
  // The date bucket comes from SQL in the school's timezone (D11); comparing
  // strings here is safe because both sides are Manila-local calendar dates.
  const todayTotal = dailyRows
    .filter((r) => r.collection_date === today)
    .reduce((s, r) => s + Number(r.total), 0);
  const monthTotal = dailyRows
    .filter((r) => r.collection_date >= monthStart)
    .reduce((s, r) => s + Number(r.total), 0);
  const transactions = dailyRows.reduce((s, r) => s + Number(r.receipt_count), 0);

  const feeTypeTotals = Object.entries(
    ((byFeeType.data ?? []) as { fee_type_name: string; total: number }[]).reduce<
      Record<string, number>
    >((acc, r) => {
      acc[r.fee_type_name] = (acc[r.fee_type_name] ?? 0) + Number(r.total);
      return acc;
    }, {}),
  ).map(([name, total]) => ({ name, total }));

  return (
    <>
      <PageHeader
        title={school.name}
        description={`School year ${schoolYear.name}`}
        actions={
          <>
            <SchoolYearPicker years={schoolYears} current={schoolYear.id} />
            {can(session.activeRole, "recordPayment") && (
              <Button asChild>
                <Link href="/collections/new">
                  <Wallet className="size-4" />
                  New payment
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active students"
          value={(enrollments.count ?? 0).toLocaleString()}
          icon={GraduationCap}
          tone="primary"
        />
        <StatCard
          label="Total assessed"
          value={formatMoney(totalCharged)}
          icon={Receipt}
        />
        <StatCard
          label="Total collected"
          value={formatMoney(totalPaid)}
          icon={Wallet}
          tone="positive"
        />
        <StatCard
          label="Outstanding"
          value={formatMoney(outstanding)}
          icon={TrendingUp}
          tone={outstanding > 0 ? "warning" : "default"}
          hint={`${unpaidStudents} student${unpaidStudents === 1 ? "" : "s"} with a balance`}
        />
        <StatCard
          label="Today's collection"
          value={formatMoney(todayTotal)}
          icon={Banknote}
        />
        <StatCard
          label="This month"
          value={formatMoney(monthTotal)}
          icon={CalendarDays}
        />
        <StatCard
          label="Transactions"
          value={transactions.toLocaleString()}
          icon={Receipt}
        />
        <StatCard
          label="Collection rate"
          value={
            totalCharged > 0
              ? `${Math.round((totalPaid / totalCharged) * 100)}%`
              : "—"
          }
          hint="Collected ÷ assessed"
          icon={TrendingUp}
        />
      </div>

      <div className="mt-8">
        <SectionHeader
          title="Collections over time"
          description="Posted receipts only — voided payments are excluded."
        />
        <CollectionCharts daily={dailyRows} byFeeType={feeTypeTotals} />
      </div>
    </>
  );
}
