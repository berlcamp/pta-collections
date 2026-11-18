import Link from "next/link";
import { CheckCircle2, HeartHandshake, Receipt } from "lucide-react";

import { ChildFilter } from "@/components/portal/child-filter";
import { PayForm } from "@/components/portal/pay-form";
import { EmptyState, PortalScreen, PortalTopBar } from "@/components/portal/screen";
import { heroPill } from "@/components/portal/styles";
import {
  getPortalAccount,
  getPortalBalances,
  getPortalChildren,
} from "@/lib/data/portal";
import { peso, t } from "@/lib/portal/i18n";
import { requirePortalSession } from "@/lib/portal/session";

export const dynamic = "force-dynamic";

/**
 * Pay Contributions.
 *
 * The amount due sits in the hero, and the two quieter things a parent does
 * from here — look back at what they paid, and give to a PTA project — are
 * small pills under it rather than equal-weight buttons, because paying is
 * what this screen is for. Each pill opens a page whose back arrow returns
 * here.
 */
export default async function PortalPayPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  const session = await requirePortalSession();
  const copy = t(session.locale);
  const { student } = await searchParams;

  const [children, balances, account] = await Promise.all([
    getPortalChildren(),
    getPortalBalances(student),
    getPortalAccount(),
  ]);

  const due = balances.reduce((sum, b) => sum + Number(b.balance), 0);

  return (
    <PortalScreen
      hero={
        <>
          <PortalTopBar backHref="/portal" backLabel={copy.back} title={copy.payTile} />

          <div className="mt-3 px-1">
            <p className="text-sm text-blue-100">{copy.amountDue}</p>
            <p className="mt-0.5 font-mono text-[2.25rem] font-semibold leading-tight tracking-tight tabular-nums md:text-5xl">
              {peso(due)}
            </p>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/portal/pay/history" className={heroPill}>
              <Receipt className="size-4" />
              {copy.payHistory}
            </Link>
            <Link href="/portal/pay/give" className={heroPill}>
              <HeartHandshake className="size-4" />
              {copy.giveDonate}
            </Link>
          </div>
        </>
      }
    >
      <ChildFilter
        students={children}
        selected={student}
        basePath="/portal/pay"
        locale={session.locale}
      />

      {balances.length === 0 ? (
        <EmptyState icon={CheckCircle2}>{copy.allPaid}</EmptyState>
      ) : (
        <PayForm
          // Remount on a child switch so a basket never outlives its list.
          key={student ?? "all"}
          balances={balances}
          locale={session.locale}
          gcashNumber={account?.gcash_number ?? null}
        />
      )}
    </PortalScreen>
  );
}
