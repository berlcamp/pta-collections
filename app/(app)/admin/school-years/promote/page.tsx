import Link from "next/link";
import { CalendarRange } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getGradeLevels, getSchoolYears } from "@/lib/data/school";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import {
  PromotionPlanner,
  type PromotionPlanRow,
} from "@/components/admin/promotion-planner";

export const dynamic = "force-dynamic";

/**
 * Rolling the roll forward into the next school year.
 *
 * The preview is server-rendered from `pta.promotion_plan()` and driven by URL
 * params, the same way the student roll's filters are: the plan is a read, so
 * it goes through the RLS-bound client like every other read here, and a
 * shareable URL means an admin can put the exact plan they are about to commit
 * in front of the principal before clicking anything.
 *
 * `promotion_plan` and `promote_students` share their CTE shape in 0021, so
 * what this screen shows is what the button does.
 */
export default async function PromotePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; exit?: string }>;
}) {
  const ctx = await requireRole(["admin"]);
  const { from, to, exit } = await searchParams;

  const [schoolYears, gradeLevels] = await Promise.all([
    getSchoolYears(ctx.activeSchool.id),
    getGradeLevels(),
  ]);

  if (schoolYears.length < 2) {
    return (
      <>
        <PageHeader
          title="Promote students"
          description="Move every enrolled student up one grade into the next school year."
        />
        <EmptyState
          icon={CalendarRange}
          title="There is no year to promote into"
          description="Promotion moves students from one school year to another, so the next year has to exist first. Create it, then come back — it does not need to be the active year yet."
          action={
            <Button asChild>
              <Link href="/admin/school-years">Create the next school year</Link>
            </Button>
          }
        />
      </>
    );
  }

  // `getSchoolYears` returns newest first. The default source is the active
  // year, and the default target is the year immediately after it — which is
  // the shape of the June task this page exists for.
  const sorted = [...schoolYears].sort((a, b) =>
    a.start_date.localeCompare(b.start_date),
  );
  const activeYear = schoolYears.find((y) => y.is_active) ?? sorted[sorted.length - 1];

  const fromYear = schoolYears.find((y) => y.id === from) ?? activeYear;
  const fromIndex = sorted.findIndex((y) => y.id === fromYear.id);
  const defaultTarget = sorted[fromIndex + 1] ?? null;
  const toYear = schoolYears.find((y) => y.id === to) ?? defaultTarget;

  // Only years that start after the source can be a target — the same guard
  // promote_students raises on, applied before the admin can pick a bad one.
  const targetOptions = sorted.filter(
    (y) => y.id !== fromYear.id && y.start_date > fromYear.start_date,
  );

  let plan: PromotionPlanRow[] = [];
  let resolvedExitGrade: string | null = exit ?? null;

  if (toYear) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("promotion_plan", {
      p_school_id: ctx.activeSchool.id,
      p_from_year_id: fromYear.id,
      p_to_year_id: toYear.id,
      p_exit_grade: exit ?? null,
    });

    plan = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      from_grade: r.from_grade as string,
      to_grade: (r.to_grade as string | null) ?? null,
      eligible: Number(r.eligible ?? 0),
      already_enrolled: Number(r.already_enrolled ?? 0),
      to_promote: Number(r.to_promote ?? 0),
      with_balance: Number(r.with_balance ?? 0),
    }));

    // When the caller named no exit grade, the plan itself reveals which one
    // the database resolved: the row that maps to nothing.
    if (!resolvedExitGrade) {
      resolvedExitGrade = plan.find((r) => r.to_grade === null)?.from_grade ?? null;
    }
  }

  return (
    <>
      <PageHeader
        title="Promote students"
        description="Move every enrolled student up one grade into the next school year, and graduate the exit cohort."
      />
      <PromotionPlanner
        schoolYears={sorted}
        targetOptions={targetOptions}
        fromYearId={fromYear.id}
        toYearId={toYear?.id ?? null}
        exitGrade={resolvedExitGrade}
        exitGradeExplicit={Boolean(exit)}
        gradeLevels={gradeLevels}
        plan={plan}
      />
    </>
  );
}
