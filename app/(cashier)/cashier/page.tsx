import { Wallet } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { resolveSchoolYear } from "@/lib/data/school";
import { getCashierReceipts } from "@/lib/reports/queries";
import { summarizeCollections } from "@/lib/cashier/report";
import { todayInTimezone } from "@/lib/utils/dates";
import { EmptyState } from "@/components/common/empty-state";
import { CollectDesk } from "@/components/cashier/collect-desk";

export const dynamic = "force-dynamic";

export default async function CollectPage() {
  const ctx = await requireRole(["admin", "cashier", "treasurer"]);
  const schoolYear = await resolveSchoolYear(ctx.activeSchool.id);

  if (!schoolYear) {
    return (
      <EmptyState
        icon={Wallet}
        title="No school year"
        description="An administrator must create a school year before payments can be recorded."
      />
    );
  }

  const today = todayInTimezone(ctx.activeSchool.timezone);
  const receipts = await getCashierReceipts({
    schoolId: ctx.activeSchool.id,
    cashierId: ctx.profile.id,
    from: today,
    to: today,
  });
  const summary = summarizeCollections(receipts);

  return (
    <CollectDesk
      schoolId={ctx.activeSchool.id}
      schoolYearId={schoolYear.id}
      todayTotal={summary.total}
      todayReceipts={summary.receipts}
      recent={receipts
        .filter((r) => r.status === "posted")
        .slice(0, 5)
        .map((r) => ({
          id: r.id,
          receiptNumber: r.receipt_number,
          studentName: r.student_name,
          amount: r.total_amount,
        }))}
    />
  );
}
