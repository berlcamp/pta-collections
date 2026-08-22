import { requireSuperAdmin } from "@/lib/auth/session";
import { PageHeader } from "@/components/common/page-header";
import { NewSchoolForm } from "@/components/admin/new-school-form";

export const dynamic = "force-dynamic";

export default async function NewSchoolPage() {
  await requireSuperAdmin();
  return (
    <>
      <PageHeader
        title="Create a school"
        description="Provision a new tenant. Its data is isolated from every other school by RLS."
      />
      <NewSchoolForm />
    </>
  );
}
