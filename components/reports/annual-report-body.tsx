import { formatMoney } from "@/lib/financial/money";
import type { AnnualReport } from "@/lib/reports/queries";

const CATEGORY_LABELS: Record<string, string> = {
  annual: "Annual PTA Fees",
  penalty: "Penalties",
  special: "Special Assessments",
  other: "Other Collections",
};

export function AnnualReportBody({
  report,
  schoolName,
  schoolYearName,
}: {
  report: AnnualReport;
  schoolName: string;
  schoolYearName: string;
}) {
  return (
    <div className="space-y-8">
      <header className="text-center">
        <h2 className="text-lg font-bold">{schoolName}</h2>
        <p className="text-sm">Parent-Teacher Association</p>
        <h3 className="mt-3 text-base font-semibold">PTA Financial Report</h3>
        <p className="text-sm text-muted-foreground">
          School Year {schoolYearName}
        </p>
      </header>

      <section>
        <h4 className="mb-2 text-sm font-semibold">Collections by category</h4>
        <table className="w-full text-sm">
          <tbody>
            {report.byCategory.map((c) => (
              <tr key={c.category} className="border-b">
                <td className="py-1.5">{CATEGORY_LABELS[c.category] ?? c.category}</td>
                <td className="py-1.5 text-right font-mono tabular-nums">
                  {formatMoney(c.total)}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 font-semibold">
              <td className="py-2">Total Collections</td>
              <td className="py-2 text-right font-mono tabular-nums">
                {formatMoney(report.totalCollections)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h4 className="mb-2 text-sm font-semibold">Detail by fee type</h4>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-1.5 font-medium">Fee type</th>
              <th className="py-1.5 text-right font-medium">Receipts</th>
              <th className="py-1.5 text-right font-medium">Collected</th>
            </tr>
          </thead>
          <tbody>
            {report.byFeeType.map((f) => (
              <tr key={f.fee_type_id} className="border-b">
                <td className="py-1.5">{f.fee_type_name}</td>
                <td className="py-1.5 text-right font-mono tabular-nums">
                  {f.receipt_count}
                </td>
                <td className="py-1.5 text-right font-mono tabular-nums">
                  {formatMoney(f.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        <div>
          <h4 className="mb-2 text-sm font-semibold">Student participation</h4>
          <dl className="space-y-1 text-sm">
            <Line label="Students enrolled" value={report.studentsEnrolled} />
            <Line label="Students assessed" value={report.studentsAssessed} />
            <Line label="Fully paid" value={report.fullyPaid} />
            <Line label="Partially paid" value={report.partiallyPaid} />
            <Line label="Unpaid" value={report.unpaid} />
          </dl>
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold">Financial summary</h4>
          <dl className="space-y-1 text-sm">
            <Line label="Total assessed" value={formatMoney(report.totalAssessed)} />
            <Line label="Total waived" value={formatMoney(report.totalWaived)} />
            <Line label="Total collected" value={formatMoney(report.totalCollected)} />
            <Line
              label="Total outstanding"
              value={formatMoney(report.totalOutstanding)}
              bold
            />
          </dl>
        </div>
      </section>

      <p className="border-t pt-4 text-xs text-muted-foreground">
        Voided transactions are excluded from every figure above. Prepared from
        system records on behalf of the PTA Treasurer.
      </p>
    </div>
  );
}

function Line({
  label,
  value,
  bold,
}: {
  label: string;
  value: string | number;
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 border-b py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`font-mono tabular-nums ${bold ? "font-semibold" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
