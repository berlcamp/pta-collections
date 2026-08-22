import { formatMoney } from "@/lib/financial/money";
import { formatDateTime } from "@/lib/utils/dates";
import { formatNameFull } from "@/lib/utils/names";
import type { ReceiptData } from "@/lib/data/payments";

/**
 * The printable receipt.
 *
 * Rendered as plain semantic HTML with print styles — no PDF library (D19).
 * `variant` switches between A4 and a 58mm thermal roll.
 */
export function Receipt({
  data,
  variant = "a4",
}: {
  data: ReceiptData;
  variant?: "a4" | "58mm";
}) {
  const {
    payment,
    school,
    schoolYear,
    student,
    enrollment,
    guardian,
    cashier,
    items,
    remainingBalance,
  } = data;

  const narrow = variant === "58mm";

  return (
    <article
      className={
        narrow
          ? "mx-auto w-[58mm] px-1 font-mono text-[10px] leading-tight text-black"
          : "mx-auto w-full max-w-[190mm] bg-white p-8 text-sm text-black"
      }
    >
      <header className={narrow ? "text-center" : "text-center"}>
        {school.logo_url && !narrow && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={school.logo_url}
            alt=""
            className="mx-auto mb-2 h-16 w-16 object-contain"
          />
        )}
        <h1 className={narrow ? "text-xs font-bold" : "text-lg font-bold"}>
          {school.name}
        </h1>
        <p className={narrow ? "" : "text-xs"}>
          {[school.address, school.city, school.province].filter(Boolean).join(", ")}
        </p>
        <p className={narrow ? "font-bold" : "mt-1 text-xs font-semibold"}>
          Parent-Teacher Association
        </p>
        <p className={narrow ? "mt-1 font-bold" : "mt-2 font-semibold tracking-wide"}>
          OFFICIAL RECEIPT
        </p>
      </header>

      {payment.status === "voided" && (
        <p
          className={
            narrow
              ? "my-1 border border-black py-0.5 text-center font-bold"
              : "my-3 border-2 border-red-600 py-1 text-center text-base font-bold text-red-600"
          }
        >
          ** VOIDED **
        </p>
      )}

      <div className={narrow ? "my-1 border-t border-dashed border-black" : "my-4 border-t"} />

      <dl className={narrow ? "space-y-0.5" : "grid grid-cols-2 gap-x-6 gap-y-1"}>
        <Row narrow={narrow} label="Receipt No." value={payment.receipt_number} bold />
        <Row
          narrow={narrow}
          label="Date"
          value={formatDateTime(payment.payment_date, school.timezone)}
        />
        <Row narrow={narrow} label="Student" value={formatNameFull(student)} />
        <Row
          narrow={narrow}
          label="Student No."
          value={enrollment?.student_number ?? "—"}
        />
        <Row
          narrow={narrow}
          label="Grade / Section"
          value={`${enrollment?.grade_level ?? "—"}${
            enrollment?.section ? ` · ${enrollment.section.name}` : ""
          }`}
        />
        <Row narrow={narrow} label="School Year" value={schoolYear.name} />
        {guardian && (
          <Row narrow={narrow} label="Parent / Guardian" value={guardian.name} />
        )}
      </dl>

      <div className={narrow ? "my-1 border-t border-dashed border-black" : "my-4 border-t"} />

      <table className="w-full">
        <thead>
          <tr className={narrow ? "border-b border-dashed border-black" : "border-b"}>
            <th className="py-1 text-left font-semibold">Particulars</th>
            <th className="py-1 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td className="py-1 pr-2 align-top">
                {item.fee_type_name}
                {item.description && item.description !== item.fee_type_name && (
                  <span className="block text-[0.9em] opacity-70">
                    {item.description}
                  </span>
                )}
              </td>
              <td className="py-1 text-right font-mono tabular-nums">
                {formatMoney(item.amount)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className={narrow ? "border-t border-black" : "border-t-2"}>
            <td className="py-1 font-bold">TOTAL PAID</td>
            <td className="py-1 text-right font-mono font-bold tabular-nums">
              {formatMoney(payment.total_amount)}
            </td>
          </tr>
          {payment.amount_tendered != null && (
            <>
              <tr>
                <td className="py-0.5">Cash tendered</td>
                <td className="py-0.5 text-right font-mono tabular-nums">
                  {formatMoney(payment.amount_tendered)}
                </td>
              </tr>
              <tr>
                <td className="py-0.5">Change</td>
                <td className="py-0.5 text-right font-mono tabular-nums">
                  {formatMoney(payment.change_amount ?? 0)}
                </td>
              </tr>
            </>
          )}
        </tfoot>
      </table>

      <div className={narrow ? "my-1 border-t border-dashed border-black" : "my-4 border-t"} />

      <dl className={narrow ? "space-y-0.5" : "grid grid-cols-2 gap-x-6 gap-y-1"}>
        <Row
          narrow={narrow}
          label="Payment method"
          value={
            {
              cash: "Cash",
              gcash: "GCash",
              bank_transfer: "Bank transfer",
              other: "Other",
            }[payment.payment_method]
          }
        />
        {payment.reference_number && (
          <Row narrow={narrow} label="Reference" value={payment.reference_number} />
        )}
        <Row narrow={narrow} label="Collected by" value={cashier?.full_name ?? "—"} />
        <Row
          narrow={narrow}
          label="Remaining balance"
          value={formatMoney(remainingBalance)}
          bold
        />
        {payment.remarks && (
          <Row narrow={narrow} label="Remarks" value={payment.remarks} />
        )}
        {payment.status === "voided" && payment.void_reason && (
          <Row narrow={narrow} label="Void reason" value={payment.void_reason} />
        )}
      </dl>

      {school.receipt_footer_text && (
        <p className={narrow ? "mt-2 text-center" : "mt-6 text-center text-xs"}>
          {school.receipt_footer_text}
        </p>
      )}

      {!narrow && (
        <div className="mt-10 grid grid-cols-2 gap-8 text-xs">
          <div className="border-t pt-1 text-center">Cashier / Collector</div>
          <div className="border-t pt-1 text-center">Payer&rsquo;s signature</div>
        </div>
      )}

      <p className={narrow ? "mt-2 text-center" : "mt-6 text-center text-[10px] opacity-60"}>
        This receipt is system-generated. Retain for your records.
      </p>
    </article>
  );
}

function Row({
  label,
  value,
  narrow,
  bold,
}: {
  label: string;
  value: string;
  narrow: boolean;
  bold?: boolean;
}) {
  if (narrow) {
    return (
      <div className="flex justify-between gap-2">
        <dt className="shrink-0 opacity-70">{label}</dt>
        <dd className={bold ? "text-right font-bold" : "text-right"}>{value}</dd>
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <dt className="w-32 shrink-0 text-xs opacity-70">{label}</dt>
      <dd className={bold ? "font-semibold" : ""}>{value}</dd>
    </div>
  );
}
