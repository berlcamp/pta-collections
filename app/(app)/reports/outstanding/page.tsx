import { redirect } from "next/navigation";

/** The Treasurer's outstanding-dues report is the same view as Charges → Outstanding. */
export default async function OutstandingReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams(
    Object.entries(sp).filter(([, v]) => v) as [string, string][],
  );
  redirect(`/charges/outstanding?${params.toString()}`);
}
