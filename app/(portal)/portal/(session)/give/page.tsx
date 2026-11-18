import { redirect } from "next/navigation";

/** Moved to /portal/pay/give. Kept so an old bookmark still lands. */
export default function LegacyGivePage() {
  redirect("/portal/pay/give");
}
