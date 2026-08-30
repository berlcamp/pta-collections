import { notFound } from "next/navigation";
import { requireSchool } from "@/lib/auth/session";
import { getAcknowledgementData } from "@/lib/data/donations";
import { Acknowledgement } from "@/components/donations/acknowledgement";
import { DonationPrintControls } from "@/components/donations/donation-print-controls";

export const dynamic = "force-dynamic";

/**
 * Printable donation acknowledgement.
 *
 * ?format=58mm renders the thermal-roll variant; anything else is A4. As with
 * the official receipt, RLS does the real access check — another school's
 * donation simply is not returned — and the tenant comparison turns a
 * wrong-school link into a 404 rather than an empty page.
 */
export default async function PrintAcknowledgementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ format?: string }>;
}) {
  const ctx = await requireSchool();
  const { id } = await params;
  const { format } = await searchParams;

  const data = await getAcknowledgementData(id);
  if (!data || data.school.id !== ctx.activeSchool.id) notFound();

  const narrow = format === "58mm";

  return (
    <>
      <style>{
        narrow
          ? "@page { size: 58mm auto; margin: 3mm; }"
          : "@page { size: A4; margin: 14mm; }"
      }</style>
      <DonationPrintControls
        donationId={id}
        currentFormat={narrow ? "58mm" : "a4"}
      />
      <Acknowledgement data={data} variant={narrow ? "58mm" : "a4"} />
    </>
  );
}
