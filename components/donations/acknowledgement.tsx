import { formatMoney } from "@/lib/financial/money";
import { formatDateTime } from "@/lib/utils/dates";
import type { AcknowledgementData } from "@/lib/data/donations";

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  gcash: "GCash",
  bank_transfer: "Bank transfer",
  other: "Other",
};

/**
 * The printable donation acknowledgement.
 *
 * Plain semantic HTML with print styles, no PDF library (D19), and the same two
 * variants as the official receipt so a school with one thermal printer is not
 * forced onto A4 for donations.
 *
 * It says ACKNOWLEDGEMENT, never OFFICIAL RECEIPT. That wording is the whole
 * point of the separate series: a voluntary gift is not a receipted fee, and a
 * parent must never be able to wave this at the school as proof of payment.
 */
export function Acknowledgement({
  data,
  variant = "a4",
}: {
  data: AcknowledgementData;
  variant?: "a4" | "58mm";
}) {
  const { donation, school, schoolYear, program, donor, receiver, pledge } = data;
  const narrow = variant === "58mm";
  const inKind = donation.kind === "in_kind";

  return (
    <article
      className={
        narrow
          ? "mx-auto w-[58mm] px-1 font-mono text-[10px] leading-tight text-black"
          : "mx-auto w-full max-w-[190mm] bg-white p-8 text-sm text-black"
      }
    >
      <header className="text-center">
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
          {[school.address, school.city, school.province]
            .filter(Boolean)
            .join(", ")}
        </p>
        <p className={narrow ? "font-bold" : "mt-1 text-xs font-semibold"}>
          Parent-Teacher Association
        </p>
        <p
          className={
            narrow
              ? "mt-1 font-bold"
              : "mt-2 font-semibold tracking-wide"
          }
        >
          {inKind ? "ACKNOWLEDGEMENT OF DONATION IN KIND" : "ACKNOWLEDGEMENT OF DONATION"}
        </p>
        {!narrow && (
          <p className="mt-1 text-[11px] text-neutral-600">
            This is not an official receipt for school fees.
          </p>
        )}
      </header>

      <div
        className={
          narrow
            ? "mt-2 border-t border-dashed border-black pt-2"
            : "mt-6 border-t pt-4"
        }
      >
        <Line
          narrow={narrow}
          label="No."
          value={<span className="font-bold">{donation.acknowledgement_number}</span>}
        />
        <Line
          narrow={narrow}
          label="Date"
          value={formatDateTime(donation.donation_date, school.timezone)}
        />
        <Line narrow={narrow} label="School year" value={schoolYear.name} />
        <Line
          narrow={narrow}
          label="Received from"
          value={
            donation.is_anonymous ? (
              <span className="italic">Anonymous donor</span>
            ) : (
              (donor?.display_name ?? "—")
            )
          }
        />
        {!donation.is_anonymous && donor?.contact_number && !narrow && (
          <Line narrow={narrow} label="Contact" value={donor.contact_number} />
        )}
        <Line narrow={narrow} label="For" value={program.name} />
      </div>

      <div
        className={
          narrow
            ? "mt-2 border-t border-dashed border-black pt-2"
            : "mt-4 border-t pt-4"
        }
      >
        {inKind ? (
          <>
            <p className={narrow ? "font-bold" : "font-semibold"}>
              Donation in kind
            </p>
            <p className={narrow ? "mt-1" : "mt-1 text-sm"}>
              {donation.item_description}
            </p>
            <div className={narrow ? "mt-2" : "mt-3"}>
              <Line
                narrow={narrow}
                label="Estimated value"
                value={
                  <span className="font-bold">{formatMoney(donation.amount)}</span>
                }
              />
            </div>
            <p
              className={
                narrow
                  ? "mt-1 text-[9px]"
                  : "mt-2 text-[11px] text-neutral-600"
              }
            >
              Goods and services are carried at an estimated value for reporting.
              No money changed hands.
            </p>
          </>
        ) : (
          <>
            <Line
              narrow={narrow}
              label="Amount received"
              value={
                <span className={narrow ? "font-bold" : "text-base font-bold"}>
                  {formatMoney(donation.amount)}
                </span>
              }
            />
            <Line
              narrow={narrow}
              label="Received as"
              value={METHOD_LABELS[donation.payment_method ?? ""] ?? "—"}
            />
            {donation.reference_number && (
              <Line
                narrow={narrow}
                label="Reference"
                value={donation.reference_number}
              />
            )}
          </>
        )}

        {pledge && (
          <div className={narrow ? "mt-2" : "mt-3"}>
            <Line
              narrow={narrow}
              label="Against pledge of"
              value={formatMoney(pledge.pledged_amount)}
            />
            <Line
              narrow={narrow}
              label="Pledge still due"
              value={formatMoney(pledge.remaining_amount)}
            />
          </div>
        )}

        {donation.remarks && (
          <p className={narrow ? "mt-2" : "mt-3 text-xs"}>{donation.remarks}</p>
        )}
      </div>

      {donation.status === "voided" && (
        <p
          className={
            narrow
              ? "mt-2 border border-black p-1 text-center font-bold"
              : "mt-4 border-2 border-black p-2 text-center font-bold tracking-widest"
          }
        >
          VOIDED
          {donation.void_reason && (
            <span className="block font-normal">{donation.void_reason}</span>
          )}
        </p>
      )}

      <footer
        className={
          narrow
            ? "mt-3 border-t border-dashed border-black pt-2 text-center"
            : "mt-8 border-t pt-4"
        }
      >
        {narrow ? (
          <>
            <p>Received by: {receiver?.full_name ?? "—"}</p>
            <p className="mt-2 font-bold">Thank you for your support.</p>
          </>
        ) : (
          <div className="flex items-end justify-between gap-8">
            <div>
              <p className="text-xs text-neutral-600">Received by</p>
              <p className="mt-6 border-t border-black pt-1 text-sm">
                {receiver?.full_name ?? "—"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold">
                Thank you for supporting our school.
              </p>
              {school.receipt_footer_text && (
                <p className="mt-1 text-[11px] text-neutral-600">
                  {school.receipt_footer_text}
                </p>
              )}
            </div>
          </div>
        )}
      </footer>
    </article>
  );
}

function Line({
  narrow,
  label,
  value,
}: {
  narrow: boolean;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div
      className={
        narrow
          ? "flex justify-between gap-2"
          : "flex justify-between gap-6 py-0.5"
      }
    >
      <span className={narrow ? "" : "text-neutral-600"}>{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
