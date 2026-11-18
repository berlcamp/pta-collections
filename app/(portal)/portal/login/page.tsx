import { redirect } from "next/navigation";
import { IdCard, ShieldCheck } from "lucide-react";

import { PortalLoginForm } from "@/components/portal/login-form";
import { LocaleSwitch } from "@/components/portal/locale-switch";
import { getPortalAccount } from "@/lib/data/portal";
import {
  clearPortalSession,
  getPortalSession,
} from "@/lib/portal/session";
import { t } from "@/lib/portal/i18n";
import type { PortalLocale } from "@/types/database.types";

export const dynamic = "force-dynamic";

/**
 * The parents' own front door.
 *
 * Separate from the staff sign-in (/login, Google by invitation) on purpose,
 * and no longer linked from it: a parent reaches this page from the landing
 * page's link or its QR code, usually by pointing a phone at a poster. So it
 * is drawn as the opening screen of a banking app, full-bleed blue.
 */
export default async function PortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  // A cookie is not somewhere to go.
  //
  // Bouncing on the mere PRESENCE of a session is what turns a revoked card
  // into ERR_TOO_MANY_REDIRECTS: the token still verifies, so this page sends
  // them to /portal, whose layout finds no account and sends them straight
  // back. So this page asks the SAME question the layout asks — does this
  // session resolve to a live account — and only redirects when the answer is
  // yes. A cookie that resolves to nobody is cleared here, and the form is
  // rendered underneath it.
  //
  // proxy.ts settles /no-access the same way, for the same reason.
  if (await getPortalSession()) {
    if (await getPortalAccount()) redirect("/portal");
    await clearPortalSession();
  }

  const { lang } = await searchParams;
  const locale: PortalLocale = lang === "tl" ? "tl" : "en";
  const copy = t(locale);

  return (
    <div className="portal-gradient min-h-svh text-white">
      <div className="mx-auto flex min-h-svh w-full max-w-md flex-col px-5 pb-[max(env(safe-area-inset-bottom),2rem)] pt-[max(env(safe-area-inset-top),0.75rem)]">
        <div className="flex h-14 items-center justify-end">
          <LocaleSwitch locale={locale} variant="link" />
        </div>

        <div className="portal-in mt-6 flex flex-col items-center text-center sm:mt-10">
          <div className="grid size-20 place-items-center rounded-[1.75rem] bg-white shadow-xl shadow-blue-950/30">
            <IdCard className="size-10 text-blue-700" strokeWidth={1.75} />
          </div>
          <h1 className="mt-6 text-[1.75rem] font-semibold leading-tight tracking-tight">
            {copy.signInTitle}
          </h1>
          <p className="mt-2 max-w-xs text-[0.95rem] leading-relaxed text-blue-100">
            {copy.signInLead}
          </p>
        </div>

        <div className="portal-in mt-8 rounded-[1.75rem] bg-white p-5 text-slate-900 shadow-2xl shadow-blue-950/40 [animation-delay:60ms]">
          {/* The "forgot your PIN" help lives inside the form, not here:
              whether this school uses a PIN at all is only known once a card
              has been submitted (0017). */}
          <PortalLoginForm locale={locale} />
        </div>

        <p className="mx-auto mt-auto flex max-w-xs items-start gap-2 pt-8 text-left text-xs leading-relaxed text-blue-100/90">
          <ShieldCheck className="mt-px size-4 shrink-0" />
          {copy.secureNote}
        </p>
      </div>
    </div>
  );
}
