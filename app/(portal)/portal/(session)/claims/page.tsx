import { redirect } from "next/navigation";

/** Moved to /portal/pay/history. Kept so an old bookmark still lands. */
export default function LegacyClaimsPage() {
  redirect("/portal/pay/history");
}
