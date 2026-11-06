import { METHOD_LABELS } from "@/lib/cashier/report";
import { formatMoney } from "@/lib/financial/money";
import { formatDateTime } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";
import type { CashierReceiptRow } from "@/lib/reports/queries";

/**
 * The receipts of a report period. Server-rendered, and shared by the screen and
 * the printed page so the two cannot disagree. A voided receipt stays in the
 * list, struck through, so the series reads without an unexplained gap.
 */
export function ReceiptTable({
  rows,
  timeZone,
  reprint = false,
}: {
  rows: CashierReceiptRow[];
  timeZone: string;
  reprint?: boolean;
}) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left text-xs text-muted-foreground print:text-neutral-600">
          <th scope="col" className="py-2 pr-3 font-medium">Receipt</th>
          <th scope="col" className="py-2 pr-3 font-medium">Time</th>
          <th scope="col" className="py-2 pr-3 font-medium">Student</th>
          <th scope="col" className="py-2 pr-3 font-medium">For</th>
          <th scope="col" className="py-2 pr-3 font-medium">Method</th>
          <th scope="col" className="py-2 text-right font-medium">Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const voided = row.status !== "posted";
          return (
            <tr key={row.id} className="border-b last:border-0 print:break-inside-avoid">
              <td className="py-2 pr-3 font-mono text-xs whitespace-nowrap">
                {reprint ? (
                  <a
                    href={`/print/receipt/${row.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {row.receipt_number}
                  </a>
                ) : (
                  row.receipt_number
                )}
              </td>
              <td className="py-2 pr-3 whitespace-nowrap">
                {formatDateTime(row.payment_date, timeZone)}
              </td>
              <td className="py-2 pr-3">{row.student_name}</td>
              <td className="py-2 pr-3">{row.fee_names}</td>
              <td className="py-2 pr-3 whitespace-nowrap">
                {METHOD_LABELS[row.payment_method] ?? row.payment_method}
                {row.reference_number && (
                  <span className="block font-mono text-xs text-muted-foreground print:text-neutral-600">
                    {row.reference_number}
                  </span>
                )}
              </td>
              <td className="py-2 text-right whitespace-nowrap tabular-nums">
                <span className={cn(voided && "line-through")}>
                  {formatMoney(row.total_amount)}
                </span>
                {voided && <span className="block text-xs font-medium">Voided</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
