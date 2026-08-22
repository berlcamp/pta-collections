import { requireRole } from "@/lib/auth/session";
import { PageHeader } from "@/components/common/page-header";
import { SchoolSettingsForm } from "@/components/admin/school-settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = await requireRole(["admin"]);
  return (
    <>
      <PageHeader
        title="School settings"
        description="These values appear on every receipt and report this school produces."
      />
      <SchoolSettingsForm school={ctx.activeSchool} />
    </>
  );
}
