import { ShieldCheck } from "lucide-react";

import { SetPinForm } from "@/components/portal/set-pin-form";
import { requirePortalSession } from "@/lib/portal/session";
import { t } from "@/lib/portal/i18n";

export const dynamic = "force-dynamic";

/**
 * The bootstrap PIN, replaced.
 *
 * A card is issued with a PIN the office reads out — like an ATM card, it is
 * worthless until the holder replaces it. `portal_accounts.must_change_pin`
 * stays true until they do, and the portal layout sends them here every time
 * until it is false. Drawn like the sign-in screen, because to the parent it
 * is the second step of signing in.
 */
export default async function SetPinPage() {
  const session = await requirePortalSession();
  const copy = t(session.locale);

  return (
    <div className="portal-gradient min-h-svh text-white">
      <div className="mx-auto flex min-h-svh w-full max-w-md flex-col px-5 md:justify-center md:py-12 pb-[max(env(safe-area-inset-bottom),2rem)] pt-[max(env(safe-area-inset-top),0.75rem)]">
        <div className="portal-in mt-14 md:mt-0 flex flex-col items-center text-center">
          <div className="grid size-20 place-items-center rounded-[1.75rem] bg-white shadow-xl shadow-blue-950/30">
            <ShieldCheck className="size-10 text-blue-700" strokeWidth={1.75} />
          </div>
          <h1 className="mt-6 text-[1.75rem] font-semibold leading-tight tracking-tight">
            {copy.setPinTitle}
          </h1>
          <p className="mt-2 max-w-xs text-[0.95rem] leading-relaxed text-blue-100">
            {copy.setPinLead}
          </p>
        </div>

        <div className="portal-in mt-8 rounded-[1.75rem] bg-white p-5 text-slate-900 shadow-2xl shadow-blue-950/40">
          <SetPinForm locale={session.locale} />
        </div>
      </div>
    </div>
  );
}
