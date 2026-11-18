import { HeartHandshake } from "lucide-react";

import { GiveForm } from "@/components/portal/give-form";
import {
  EmptyState,
  PortalScreen,
  PortalTopBar,
  SectionTitle,
} from "@/components/portal/screen";
import { portalCard } from "@/components/portal/styles";
import {
  getPortalAccount,
  getPortalPledges,
  getPortalPrograms,
} from "@/lib/data/portal";
import { peso, t } from "@/lib/portal/i18n";
import { requirePortalSession } from "@/lib/portal/session";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Give / Donate — reached from a pill on the Pay screen, and back to it.
 *
 * Donations are a SECOND money path (0014): nothing here touches a student
 * charge. A gift goes through the same claim queue a fee payment does; a
 * pledge moves no money and writes straight through.
 */
export default async function PortalGivePage() {
  const session = await requirePortalSession();
  const copy = t(session.locale);

  const [programs, pledges, account] = await Promise.all([
    getPortalPrograms(),
    getPortalPledges(),
    getPortalAccount(),
  ]);

  return (
    <PortalScreen
      hero={
        <>
          <PortalTopBar
            backHref="/portal/pay"
            backLabel={copy.back}
            title={copy.giveDonate}
          />
          <p className="mt-2 max-w-sm px-1 text-[0.95rem] leading-relaxed text-blue-100">
            {copy.giveLead}
          </p>
        </>
      }
    >
      {programs.length === 0 && (
        <EmptyState icon={HeartHandshake}>{copy.noPrograms}</EmptyState>
      )}

      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        {programs.map((program) => (
          <GiveForm
            key={program.id}
            program={program}
            locale={session.locale}
            gcashNumber={account?.gcash_number ?? null}
          />
        ))}
      </div>

      {pledges.length > 0 && (
        <>
          <SectionTitle>{copy.myPledges}</SectionTitle>
          <ul className={cn(portalCard, "divide-y divide-slate-100 overflow-hidden")}>
            {pledges.map((pledge) => {
              const done = pledge.fulfilment_status === "fulfilled";
              const pct =
                Number(pledge.pledged_amount) > 0
                  ? Math.min(
                      100,
                      (Number(pledge.fulfilled_amount) / Number(pledge.pledged_amount)) * 100,
                    )
                  : 0;
              return (
                <li key={pledge.id} className="px-4 py-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-[0.95rem] font-medium text-slate-900">
                      {pledge.program_name}
                    </p>
                    <span
                      className={cn(
                        "shrink-0 text-xs font-medium capitalize",
                        done ? "text-emerald-600" : "text-slate-500",
                      )}
                    >
                      {pledge.fulfilment_status.replace(/_/g, " ")}
                    </span>
                  </div>
                  {/* Fulfilment is derived in v_donation_pledge_status, never
                      stored (D15). This is a read of that, not a tally. */}
                  <p className="mt-0.5 font-mono text-xs text-slate-500">
                    {peso(pledge.fulfilled_amount)} / {peso(pledge.pledged_amount)}
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={cn("h-full rounded-full", done ? "bg-emerald-500" : "portal-cta")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </PortalScreen>
  );
}
