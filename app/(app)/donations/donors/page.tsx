import { Users } from "lucide-react";

import { requireSchool } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { getSchoolYears, resolveSchoolYear } from "@/lib/data/school";
import { getDonorTotals } from "@/lib/data/donations";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { SchoolYearPicker } from "@/components/common/school-year-picker";
import { DonorManager } from "@/components/donations/donor-manager";
import type { DonorRow } from "@/components/tables/donors-table";
import type { Donor } from "@/types/database.types";

export const dynamic = "force-dynamic";

/**
 * Who has given, and how much.
 *
 * Anonymous donations are absent by construction — they carry no donor_id, so
 * v_donor_totals cannot name them. Their money is still counted on the program
 * pages; it simply has nobody to attribute it to.
 */
export default async function DonorsPage({
  searchParams,
}: {
  searchParams: Promise<{ sy?: string }>;
}) {
  const ctx = await requireSchool();
  const { sy } = await searchParams;

  const [schoolYear, schoolYears] = await Promise.all([
    resolveSchoolYear(ctx.activeSchool.id, sy),
    getSchoolYears(ctx.activeSchool.id),
  ]);

  if (!schoolYear) {
    return (
      <>
        <PageHeader title="Donors" />
        <EmptyState icon={Users} title="No school year yet" />
      </>
    );
  }

  const totals = await getDonorTotals(ctx.activeSchool.id, schoolYear.id, 500);

  const supabase = await createClient();
  const donorRecords = totals.length
    ? (
        await supabase
          .from("donors")
          .select("*")
          .eq("school_id", ctx.activeSchool.id)
          .in("id", totals.map((t) => t.donor_id))
      ).data
    : [];

  const byId = new Map(((donorRecords ?? []) as Donor[]).map((d) => [d.id, d]));

  const rows: DonorRow[] = totals.map((t) => ({
    ...t,
    donor: byId.get(t.donor_id) ?? null,
  }));

  return (
    <>
      <PageHeader
        title="Donors"
        description={`${rows.length} named donor${rows.length === 1 ? "" : "s"} · ${schoolYear.name}`}
        actions={<SchoolYearPicker years={schoolYears} current={schoolYear.id} />}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No named donors yet"
          description="A donor appears here the first time they give. Anonymous donations are counted on the program pages but never listed by name."
        />
      ) : (
        <DonorManager
          rows={rows}
          timezone={ctx.activeSchool.timezone}
          canManage={can(ctx.activeRole, "manageDonors")}
        />
      )}
    </>
  );
}
