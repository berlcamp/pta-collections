import { Wallet } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { resolveSchoolYear } from "@/lib/data/school";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { NewPaymentFlow } from "@/components/collections/new-payment-flow";

export const dynamic = "force-dynamic";

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  const ctx = await requireRole(["admin", "cashier", "treasurer"]);
  const { student } = await searchParams;
  const schoolYear = await resolveSchoolYear(ctx.activeSchool.id);

  if (!schoolYear) {
    return (
      <>
        <PageHeader title="New payment" />
        <EmptyState
          icon={Wallet}
          title="No school year"
          description="An administrator must create a school year before payments can be recorded."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="New payment"
        description={`${ctx.activeSchool.name} · ${schoolYear.name}`}
      />
      <NewPaymentFlow
        schoolId={ctx.activeSchool.id}
        schoolYearId={schoolYear.id}
        initialStudentId={student ?? null}
      />
    </>
  );
}
