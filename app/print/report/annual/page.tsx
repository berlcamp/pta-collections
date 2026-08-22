import { notFound } from "next/navigation";
import { requireSchool } from "@/lib/auth/session";
import { resolveSchoolYear } from "@/lib/data/school";
import { getAnnualReport } from "@/lib/reports/queries";
import { AnnualReportBody } from "@/components/reports/annual-report-body";
import { PrintNowButton } from "@/components/reports/print-now-button";

export const dynamic = "force-dynamic";

export default async function PrintAnnualReport({
  searchParams,
}: {
  searchParams: Promise<{ sy?: string }>;
}) {
  const ctx = await requireSchool();
  const { sy } = await searchParams;
  const schoolYear = await resolveSchoolYear(ctx.activeSchool.id, sy);
  if (!schoolYear) notFound();

  const report = await getAnnualReport(ctx.activeSchool.id, schoolYear.id);

  return (
    <>
      <style>{"@page { size: A4; margin: 16mm; }"}</style>
      <PrintNowButton />
      <div className="mx-auto max-w-[190mm] p-8">
        <AnnualReportBody
          report={report}
          schoolName={ctx.activeSchool.name}
          schoolYearName={schoolYear.name}
        />
      </div>
    </>
  );
}
