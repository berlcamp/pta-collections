import { ChildFilter } from "@/components/portal/child-filter";
import { PayForm } from "@/components/portal/pay-form";
import { Card, CardContent } from "@/components/ui/card";
import {
  getPortalAccount,
  getPortalBalances,
  getPortalChildren,
} from "@/lib/data/portal";
import { t } from "@/lib/portal/i18n";
import { requirePortalSession } from "@/lib/portal/session";

export const dynamic = "force-dynamic";

export default async function PortalBalancesPage({
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

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">{copy.feesTitle}</h1>

      <ChildFilter
        students={children}
        selected={student}
        basePath="/portal/balances"
      />

      {balances.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            {copy.nothingDue}
          </CardContent>
        </Card>
      ) : (
        <PayForm
          balances={balances}
          locale={session.locale}
          gcashNumber={account?.gcash_number ?? null}
        />
      )}
    </div>
  );
}
