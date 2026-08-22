import { notFound } from "next/navigation";
import { getReceiptData } from "@/lib/data/payments";
import { requireSchool } from "@/lib/auth/session";
import { Receipt } from "@/components/collections/receipt";
import { PrintControls } from "@/components/collections/print-controls";

export const dynamic = "force-dynamic";

/**
 * Printable receipt.
 *
 * ?format=58mm renders the thermal-roll variant; anything else is A4.
 * RLS does the real access check — a receipt from another school simply is not
 * returned — but we also confirm the school matches so a wrong-tenant link
 * 404s rather than rendering an empty page.
 */
export default async function PrintReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ format?: string }>;
}) {
  const ctx = await requireSchool();
  const { id } = await params;
  const { format } = await searchParams;

  const data = await getReceiptData(id);
  if (!data || data.school.id !== ctx.activeSchool.id) notFound();

  const narrow = format === "58mm";

  return (
    <>
      <style>{
        narrow
          ? "@page { size: 58mm auto; margin: 3mm; }"
          : "@page { size: A4; margin: 14mm; }"
      }</style>
      <PrintControls
        receiptId={id}
        currentFormat={narrow ? "58mm" : "a4"}
      />
      <Receipt data={data} variant={narrow ? "58mm" : "a4"} />
    </>
  );
}
