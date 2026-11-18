import Link from "next/link";
import { DoorOpen } from "lucide-react";
import { requireSchool } from "@/lib/auth/session";
import { getSchoolYears, resolveSchoolYear } from "@/lib/data/school";
import { getSectionChargeSummary } from "@/lib/reports/queries";
import { dynamicRoute } from "@/lib/routes";
import { formatMoney } from "@/lib/financial/money";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { ReportFilters } from "@/components/reports/report-filters";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SectionChargeSummary } from "@/types/database.types";

export const dynamic = "force-dynamic";

const CATEGORIES = [
  { value: "", label: "All fees" },
  { value: "homeroom", label: "Homeroom" },
  { value: "annual", label: "Annual" },
  { value: "special", label: "Special" },
] as const;

/**
 * What each room owes, by fee. Answers the homeroom adviser's question —
 * "Grade 7 Rizal: ₱6,400 of ₱9,000, and who hasn't paid" — for the PTA that
 * keeps the money. A section is the one the student was in THAT year; see
 * v_section_charge_summary.
 */
export default async function SectionReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireSchool();
  const sp = await searchParams;
  const category = CATEGORIES.some((c) => c.value === sp.cat) ? sp.cat! : "";

  const [schoolYear, schoolYears] = await Promise.all([
    resolveSchoolYear(ctx.activeSchool.id, sp.sy),
    getSchoolYears(ctx.activeSchool.id),
  ]);

  if (!schoolYear) {
    return (
      <>
        <PageHeader title="Section report" />
        <EmptyState icon={DoorOpen} title="No school year yet" />
      </>
    );
  }

  const rows = await getSectionChargeSummary(
    ctx.activeSchool.id,
    schoolYear.id,
    category || null,
  );

  const groups = new Map<string, SectionChargeSummary[]>();
  for (const r of rows) {
    const key = `${r.grade_level}|${r.section_id ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const totals = rows.reduce(
    (t, r) => ({
      charged: t.charged + r.charged,
      collected: t.collected + r.collected,
      balance: t.balance + r.balance,
    }),
    { charged: 0, collected: 0, balance: 0 },
  );

  function hrefFor(cat: string) {
    const next = new URLSearchParams();
    if (sp.sy) next.set("sy", sp.sy);
    if (cat) next.set("cat", cat);
    const qs = next.toString();
    return dynamicRoute(`/reports/sections${qs ? `?${qs}` : ""}`);
  }

  return (
    <>
      <PageHeader
        title="Section report"
        description={`What each section was charged, has paid, and still owes in ${schoolYear.name}.`}
      />

      <ReportFilters schoolYears={schoolYears} currentYearId={schoolYear.id} />

      <div className="mb-6 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <Link
            key={c.value}
            href={hrefFor(c.value)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              category === c.value
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-muted",
            )}
          >
            {c.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={DoorOpen}
          title="No charges here yet"
          description="Assess a fee to a grade or section under Charges → Assess fees."
        />
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Charged" value={totals.charged} />
            <Stat label="Collected" value={totals.collected} tone="good" />
            <Stat label="Still owed" value={totals.balance} tone="warn" />
          </div>

          {[...groups.values()].map((fees) => {
            const first = fees[0]!;
            const charged = fees.reduce((s, f) => s + f.charged, 0);
            const collected = fees.reduce((s, f) => s + f.collected, 0);
            const pct = charged > 0 ? Math.round((collected / charged) * 100) : 0;
            return (
              <Card key={`${first.grade_level}|${first.section_id ?? ""}`}>
                <CardHeader className="flex flex-row flex-wrap items-baseline justify-between gap-2">
                  <CardTitle className="text-base">
                    {first.grade_level}
                    {" · "}
                    {first.section_name ?? (
                      <span className="font-normal text-muted-foreground">No section</span>
                    )}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-mono font-medium text-foreground">
                      {formatMoney(collected)}
                    </span>{" "}
                    of {formatMoney(charged)} · {pct}%
                  </p>
                </CardHeader>
                <CardContent className="px-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-6">Fee</TableHead>
                        <TableHead className="text-right">Students</TableHead>
                        <TableHead className="text-right">Not fully paid</TableHead>
                        <TableHead className="text-right">Charged</TableHead>
                        <TableHead className="text-right">Collected</TableHead>
                        <TableHead className="pr-6 text-right">Owed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fees.map((f) => (
                        <TableRow key={f.fee_type_id}>
                          <TableCell className="pl-6 font-medium">
                            {f.fee_type_name}
                            {f.fee_category === "homeroom" && (
                              <Badge variant="secondary" className="ml-2">
                                Homeroom
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {f.student_count}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right tabular-nums",
                              f.unpaid_count > 0 && "font-medium text-amber-600",
                            )}
                          >
                            {f.unpaid_count}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {formatMoney(f.charged)}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {formatMoney(f.collected)}
                          </TableCell>
                          <TableCell className="pr-6 text-right font-mono tabular-nums">
                            {formatMoney(f.balance)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "good" | "warn";
}) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-mono text-xl font-semibold tabular-nums",
          tone === "good" && "text-emerald-600",
          tone === "warn" && value > 0 && "text-amber-600",
        )}
      >
        {formatMoney(value)}
      </p>
    </div>
  );
}
