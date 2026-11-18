import { redirect } from "next/navigation";

/** Moved to /portal/pay. Kept so an old bookmark or message still lands. */
export default async function LegacyBalancesPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  const { student } = await searchParams;
  redirect(student ? `/portal/pay?student=${encodeURIComponent(student)}` : "/portal/pay");
}
