import { requireRole } from "@/lib/auth/session";
import { getFeeTypes } from "@/lib/data/school";
import { PageHeader } from "@/components/common/page-header";
import { FeeTypeManager } from "@/components/charges/fee-type-manager";

export const dynamic = "force-dynamic";

export default async function FeeTypesPage() {
  const ctx = await requireRole(["admin"]);
  const feeTypes = await getFeeTypes(ctx.activeSchool.id, false);

  return (
    <>
      <PageHeader
        title="Fee types"
        description="Every charge in the system references a fee type. Nothing is hard-coded."
      />
      <FeeTypeManager feeTypes={feeTypes} />
    </>
  );
}
