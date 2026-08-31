import { redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";

import { PortalLoginForm } from "@/components/portal/login-form";
import { LocaleSwitch } from "@/components/portal/locale-switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getPortalAccount } from "@/lib/data/portal";
import {
  clearPortalSession,
  getPortalSession,
} from "@/lib/portal/session";
import { t } from "@/lib/portal/i18n";
import type { PortalLocale } from "@/types/database.types";

export const dynamic = "force-dynamic";

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
    <div className="grid min-h-svh place-items-center p-5">
      <div className="w-full max-w-sm space-y-4">
        <Card className="shadow-lg">
          <CardHeader className="items-center gap-2 text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <GraduationCap className="size-7" />
            </div>
            <CardTitle className="text-xl">{copy.signInTitle}</CardTitle>
            <CardDescription className="text-pretty">
              {copy.signInLead}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* The "forgot your PIN" help lives inside the form, not here:
                whether this school uses a PIN at all is only known once a card
                has been submitted (0017). */}
            <PortalLoginForm locale={locale} />
          </CardContent>
        </Card>
        <div className="flex justify-center">
          <LocaleSwitch locale={locale} variant="link" />
        </div>
      </div>
    </div>
  );
}
