import { FileText, Users, Wallet } from "lucide-react";
import { requireSchool } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getSchoolYears, resolveSchoolYear } from "@/lib/data/school";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { SchoolYearPicker } from "@/components/common/school-year-picker";
import { StatCard } from "@/components/common/stat-card";
import { OutstandingTable } from "@/components/tables/outstanding-table";
import { formatDate } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/financial/money";
import { IncludeInactiveToggle } from "@/components/charges/include-inactive-toggle";

export const dynamic = "force-dynamic";

/**
 * D25: transferred-out students keep their receivables and appear here, flagged.
 * Silently dropping them is how PTA books stop reconciling.
 */
export default async function OutstandingDuesPage({
  searchParams,
}: {
  searchParams: Promise<{ sy?: string; inactive?: string }>;
}) {
  const ctx = await requireSchool();
  const { sy, inactive } = await searchParams;
  const includeInactive = inactive === "1";

  const [schoolYear, schoolYears] = await Promise.all([
    resolveSchoolYear(ctx.activeSchool.id, sy),
    getSchoolYears(ctx.activeSchool.id),
  ]);

  if (!schoolYear) {
    return (
      <>
        <PageHeader title="Outstanding dues" />
        <EmptyState icon={FileText} title="No school year yet" />
      </>
    );
  }

  const supabase = await createClient();
  let query = supabase
    .from("v_outstanding_dues")
    .select("*")
    .eq("school_id", ctx.activeSchool.id)
    .eq("school_year_id", schoolYear.id);

  if (!includeInactive) query = query.eq("student_status", "active");

  const { data } = await query
    .order("last_name")
    .order("first_name")
    .order("due_date", { nullsFirst: false });

  type Row = {
    charge_id: string;
    student_id: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    suffix: string | null;
    student_status: string;
    grade_level: string;
    section_name: string | null;
    fee_type_name: string;
    description: string | null;
    amount: number;
    waived_amount: number;
    paid: number;
    balance: number;
    due_date: string | null;
    payment_status: "unpaid" | "partially_paid";
    primary_guardian_name: string | null;
    primary_guardian_contact: string | null;
  };

  const rows = (data ?? []) as Row[];
  const total = rows.reduce((s, r) => s + Number(r.balance), 0);
  const students = new Set(rows.map((r) => r.student_id)).size;
  const inactiveCount = rows.filter((r) => r.student_status !== "active").length;

  return (
    <>
      <PageHeader
        title="Outstanding dues"
        description={`${schoolYear.name}`}
        actions={
          <>
            <IncludeInactiveToggle checked={includeInactive} />
            <SchoolYearPicker years={schoolYears} current={schoolYear.id} />
          </>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Total outstanding"
          value={formatMoney(total)}
          tone="warning"
          icon={Wallet}
        />
        <StatCard
          label="Students with a balance"
          value={students.toLocaleString()}
          icon={Users}
        />
        <StatCard
          label="Unsettled charges"
          value={rows.length.toLocaleString()}
          icon={FileText}
        />
      </div>

      {includeInactive && inactiveCount > 0 && (
        <p className="mb-3 text-sm text-muted-foreground">
          Including {inactiveCount} charge{inactiveCount === 1 ? "" : "s"} against
          students who are no longer active. These stay on the books until an
          administrator waives or cancels them.
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nothing outstanding"
          description="Every assessed charge for this school year has been settled."
        />
      ) : (
        <OutstandingTable
          rows={rows.map((r) => ({
            charge_id: r.charge_id,
            student_id: r.student_id,
            student_name: `${r.last_name}, ${r.first_name}`,
            student_status: r.student_status,
            grade_level: r.grade_level,
            section_name: r.section_name,
            guardian_name: r.primary_guardian_name,
            guardian_contact: r.primary_guardian_contact,
            fee_type_name: r.fee_type_name,
            due: r.due_date ? formatDate(r.due_date) : "—",
            amount: Number(r.amount),
            paid: Number(r.paid),
            balance: Number(r.balance),
            payment_status: r.payment_status,
          }))}
        />
      )}
    </>
  );
}
