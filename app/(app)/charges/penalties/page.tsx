import { ClipboardList } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getFeeTypes, resolveSchoolYear } from "@/lib/data/school";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { PenaltiesTable } from "@/components/tables/penalties-table";
import { formatDate } from "@/lib/utils/dates";
import { PenaltyDialog } from "@/components/charges/penalty-dialog";
import { lookupNames } from "@/lib/data/hydrate";

export const dynamic = "force-dynamic";

export default async function PenaltiesPage() {
  const ctx = await requireRole(["admin", "treasurer"]);
  const schoolYear = await resolveSchoolYear(ctx.activeSchool.id);

  if (!schoolYear) {
    return (
      <>
        <PageHeader title="Student penalties" />
        <EmptyState icon={ClipboardList} title="No school year yet" />
      </>
    );
  }

  const feeTypes = await getFeeTypes(ctx.activeSchool.id);
  const penaltyTypes = feeTypes.filter((f) => f.category === "penalty");

  const supabase = await createClient();
  const { data } = await supabase
    .from("v_student_charge_balances")
    .select("*")
    .eq("school_id", ctx.activeSchool.id)
    .eq("school_year_id", schoolYear.id)
    .eq("fee_category", "penalty")
    .order("created_at", { ascending: false });

  type Row = {
    id: string;
    student_id: string;
    fee_type_name: string;
    description: string | null;
    amount: number;
    paid: number;
    balance: number;
    due_date: string | null;
    created_at: string;
    payment_status: "unpaid" | "partially_paid" | "paid" | "waived" | "cancelled";
  };

  const rows = (data ?? []) as unknown as Row[];
  // Names come from a separate lookup rather than an embedded join: this reads
  // a VIEW, and PostgREST embedding through views is inference-based and fails
  // by returning nulls. See lib/data/hydrate.ts.
  const names = await lookupNames(rows.map((r) => r.student_id), []);

  return (
    <>
      <PageHeader
        title="Student penalties"
        description={`One-off charges against individual students · ${schoolYear.name}`}
        actions={
          <PenaltyDialog
            schoolYearId={schoolYear.id}
            schoolId={ctx.activeSchool.id}
            penaltyTypes={penaltyTypes}
          />
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No penalties recorded"
          description="A penalty appears under the student's outstanding dues immediately after it is created."
        />
      ) : (
        <PenaltiesTable
          rows={rows.map((r) => {
            const s = names.students.get(r.student_id);
            return {
              id: r.id,
              student_id: r.student_id,
              student_name: s ? `${s.last_name}, ${s.first_name}` : "—",
              fee_type_name: r.fee_type_name,
              description: r.description ?? "—",
              recorded: formatDate(r.created_at, ctx.activeSchool.timezone),
              due: r.due_date ? formatDate(r.due_date) : "—",
              amount: Number(r.amount),
              balance: Number(r.balance),
              payment_status: r.payment_status,
            };
          })}
        />
      )}
    </>
  );
}
