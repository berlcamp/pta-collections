import { redirect } from "next/navigation";

/**
 * Payments are taken at the cashier desk only. This URL stays so old
 * bookmarks and links land somewhere useful instead of a 404.
 */
export default function NewPaymentPage() {
  redirect("/cashier");
}
