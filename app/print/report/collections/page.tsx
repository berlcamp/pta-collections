import { requireRole } from "@/lib/auth/session";
import { getCashierReceipts } from "@/lib/reports/queries";
import { resolvePeriod, summarizeCollections } from "@/lib/cashier/report";
import { formatMoney } from "@/lib/financial/money";
import { formatDate, formatDateTime, todayInTimezone } from "@/lib/utils/dates";
import { PrintNowButton } from "@/components/reports/print-now-button";
import { ReceiptTable } from "@/components/cashier/receipt-table";

export const dynamic = "force-dynamic";

/**
 * The printed collection report a cashier hands in with the cash. "Save as PDF"
 * in the print dialog is the whole PDF story (D19).
 */
export default async function PrintCollectionReport({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const ctx = await requireRole(["admin", "cashier", "treasurer"]);
  const sp = await searchParams;

  const timeZone = ctx.activeSchool.timezone;
  const { from, to } = resolvePeriod(sp.from, sp.to, todayInTimezone(timeZone));

  const rows = await getCashierReceipts({
    schoolId: ctx.activeSchool.id,
    cashierId: ctx.profile.id,
    from,
    to,
  });
  const summary = summarizeCollections(rows);

  return (
    <>
      <style>{"@page { size: A4; margin: 14mm; }"}</style>
      <PrintNowButton />
      <div className="mx-auto max-w-[190mm] space-y-6 p-8 print:p-0">
        <header className="border-b border-black pb-3">
          <p className="text-sm">{ctx.activeSchool.name}</p>
          <h1 className="text-xl font-semibold">Collection report</h1>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 text-sm">
            <dt className="text-neutral-600">Cashier</dt>
            <dd>{ctx.profile.full_name}</dd>
            <dt className="text-neutral-600">Period</dt>
            <dd>
              {from === to ? formatDate(from) : `${formatDate(from)} to ${formatDate(to)}`}
            </dd>
            <dt className="text-neutral-600">Printed</dt>
            <dd>{formatDateTime(new Date().toISOString(), timeZone)}</dd>
          </dl>
        </header>

        <table className="w-full max-w-sm border-collapse text-sm">
          <tbody>
            {summary.byMethod.map((m) => (
              <tr key={m.method} className="border-b">
                <th scope="row" className="py-1.5 text-left font-normal">
                  {m.label} ({m.receipts})
                </th>
                <td className="py-1.5 text-right tabular-nums">{formatMoney(m.total)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <th scope="row" className="py-1.5 text-left">
                Total ({summary.receipts} {summary.receipts === 1 ? "receipt" : "receipts"})
              </th>
              <td className="py-1.5 text-right tabular-nums">{formatMoney(summary.total)}</td>
            </tr>
            <tr className="font-semibold">
              <th scope="row" className="py-1.5 text-left">Cash to hand in</th>
              <td className="py-1.5 text-right tabular-nums">{formatMoney(summary.cash)}</td>
            </tr>
          </tbody>
        </table>

        {rows.length === 0 ? (
          <p className="text-sm">No receipts in this period.</p>
        ) : (
          <ReceiptTable rows={rows} timeZone={timeZone} />
        )}

        <p className="text-xs text-neutral-600">
          Fee collections only. Voided receipts are listed and not counted. Donations
          have their own receipt series.
        </p>

        <div className="grid grid-cols-2 gap-10 pt-12 text-sm print:break-inside-avoid">
          <div className="border-t border-black pt-1">
            Prepared by: {ctx.profile.full_name}
          </div>
          <div className="border-t border-black pt-1">Received by</div>
        </div>
      </div>
    </>
  );
}
