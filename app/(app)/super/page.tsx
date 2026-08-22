import Link from "next/link";
import { Building2, GraduationCap, Plus, TrendingUp, Wallet } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/financial/money";
import { todayInTimezone } from "@/lib/utils/dates";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState } from "@/components/common/empty-state";
import { SchoolsTable } from "@/components/tables/schools-table";
import { Button } from "@/components/ui/button";
import type { School } from "@/types/database.types";

export const dynamic = "force-dynamic";

/**
 * The global Super Admin dashboard. Cross-school totals only — never mixed with
 * a single school's figures.
 */
export default async function SuperDashboardPage() {
  await requireSuperAdmin();
  const supabase = await createClient();

  const [schoolsRes, enrollRes, finRes, dailyRes] = await Promise.all([
    supabase.from("schools").select("*").order("name"),
    supabase
      .from("student_enrollments")
      .select("school_id, school_year_id, status"),
    supabase
      .from("v_student_financials")
      .select("school_id, total_paid, outstanding"),
    supabase
      .from("v_daily_collections")
      .select("school_id, collection_date, total"),
  ]);

  const schools = (schoolsRes.data ?? []) as School[];

  const enrollments = (enrollRes.data ?? []) as {
    school_id: string;
    status: string;
  }[];
  const fins = (finRes.data ?? []) as {
    school_id: string;
    total_paid: number;
    outstanding: number;
  }[];
  const daily = (dailyRes.data ?? []) as {
    school_id: string;
    collection_date: string;
    total: number;
  }[];

  const perSchool = new Map(
    schools.map((s) => [
      s.id,
      {
        students: 0,
        collected: 0,
        outstanding: 0,
        today: 0,
        lastActivity: null as string | null,
      },
    ]),
  );

  for (const e of enrollments) {
    const row = perSchool.get(e.school_id);
    if (row && e.status === "enrolled") row.students += 1;
  }
  for (const f of fins) {
    const row = perSchool.get(f.school_id);
    if (row) {
      row.collected += Number(f.total_paid);
      row.outstanding += Number(f.outstanding);
    }
  }
  for (const d of daily) {
    const row = perSchool.get(d.school_id);
    const school = schools.find((s) => s.id === d.school_id);
    if (!row || !school) continue;
    if (d.collection_date === todayInTimezone(school.timezone)) {
      row.today += Number(d.total);
    }
    if (!row.lastActivity || d.collection_date > row.lastActivity) {
      row.lastActivity = d.collection_date;
    }
  }

  const totals = [...perSchool.values()].reduce(
    (acc, r) => ({
      students: acc.students + r.students,
      collected: acc.collected + r.collected,
      outstanding: acc.outstanding + r.outstanding,
      today: acc.today + r.today,
    }),
    { students: 0, collected: 0, outstanding: 0, today: 0 },
  );

  const activeSchools = schools.filter((s) => s.active).length;

  return (
    <>
      <PageHeader
        title="Global administration"
        description="Cross-school totals. Select a school from the header to work inside it."
        actions={
          <Button asChild>
            <Link href="/super/schools/new">
              <Plus className="size-4" />
              New school
            </Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total schools" value={schools.length} icon={Building2} />
        <StatCard label="Active schools" value={activeSchools} icon={Building2} />
        <StatCard
          label="Students"
          value={totals.students.toLocaleString()}
          icon={GraduationCap}
        />
        <StatCard
          label="Collections"
          value={formatMoney(totals.collected)}
          icon={Wallet}
          tone="positive"
        />
        <StatCard
          label="Collected today"
          value={formatMoney(totals.today)}
          icon={TrendingUp}
        />
      </div>

      <div className="mt-6">
        {schools.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No schools yet"
            description="Create the first school, then invite its administrator."
            action={
              <Button asChild>
                <Link href="/super/schools/new">Create a school</Link>
              </Button>
            }
          />
        ) : (
          <SchoolsTable
            rows={schools.map((s) => {
              const row = perSchool.get(s.id)!;
              return {
                id: s.id,
                name: s.name,
                school_code: s.school_code,
                active: s.active,
                students: row.students,
                collected: row.collected,
                outstanding: row.outstanding,
                last_activity: row.lastActivity ?? "—",
              };
            })}
          />
        )}
      </div>
    </>
  );
}
