import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { GiveForm } from "@/components/portal/give-form";
import {
  getPortalAccount,
  getPortalPledges,
  getPortalPrograms,
} from "@/lib/data/portal";
import { peso, t } from "@/lib/portal/i18n";
import { requirePortalSession } from "@/lib/portal/session";

export const dynamic = "force-dynamic";

export default async function PortalGivePage() {
  const session = await requirePortalSession();
  const copy = t(session.locale);

  const [programs, pledges, account] = await Promise.all([
    getPortalPrograms(),
    getPortalPledges(),
    getPortalAccount(),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{copy.giveTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{copy.giveLead}</p>
      </div>

      {programs.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            {copy.noPrograms}
          </CardContent>
        </Card>
      )}

      {programs.map((program) => (
        <GiveForm
          key={program.id}
          program={program}
          locale={session.locale}
          gcashNumber={account?.gcash_number ?? null}
        />
      ))}

      {pledges.length > 0 && (
        <section className="space-y-2 pt-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {copy.myPledges}
          </h2>
          <Card>
            <CardContent className="divide-y p-0">
              {pledges.map((pledge) => (
                <div key={pledge.id} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {pledge.program_name}
                    </p>
                    {/* Fulfilment is derived in v_donation_pledge_status, never
                        stored (D15). This is a read of that, not a tally. */}
                    <p className="text-xs text-muted-foreground">
                      {peso(pledge.fulfilled_amount)} / {peso(pledge.pledged_amount)}
                    </p>
                  </div>
                  <Badge
                    variant={
                      pledge.fulfilment_status === "fulfilled"
                        ? "secondary"
                        : "outline"
                    }
                  >
                    {pledge.fulfilment_status.replace(/_/g, " ")}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
