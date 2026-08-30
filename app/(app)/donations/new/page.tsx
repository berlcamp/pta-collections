import { HandCoins } from "lucide-react";

import { requireRole } from "@/lib/auth/session";
import { resolveSchoolYear } from "@/lib/data/school";
import { getOpenPrograms, getPledges } from "@/lib/data/donations";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { DonationForm } from "@/components/donations/donation-form";

export const dynamic = "force-dynamic";

export default async function NewDonationPage({
  searchParams,
}: {
  searchParams: Promise<{ program?: string }>;
}) {
  const ctx = await requireRole(["admin", "cashier", "treasurer"]);
  const { program } = await searchParams;

  const schoolYear = await resolveSchoolYear(ctx.activeSchool.id);
  if (!schoolYear) {
    return (
      <>
        <PageHeader title="Record a donation" />
        <EmptyState
          icon={HandCoins}
          title="No school year yet"
          description="Create a school year before recording donations."
        />
      </>
    );
  }

  const [programs, openPledges] = await Promise.all([
    getOpenPrograms(ctx.activeSchool.id, schoolYear.id),
    getPledges(ctx.activeSchool.id, schoolYear.id, { openOnly: true }),
  ]);

  return (
    <>
      <PageHeader
        title="Record a donation"
        description="A voluntary gift to a PTA program. It creates no charge and settles no fee."
      />
      <DonationForm
        schoolId={ctx.activeSchool.id}
        schoolYearId={schoolYear.id}
        programs={programs}
        openPledges={openPledges}
        presetProgramId={program}
      />
    </>
  );
}
