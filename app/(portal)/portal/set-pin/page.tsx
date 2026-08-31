import { ShieldCheck } from "lucide-react";

import { SetPinForm } from "@/components/portal/set-pin-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requirePortalSession } from "@/lib/portal/session";
import { t } from "@/lib/portal/i18n";

export const dynamic = "force-dynamic";

/**
 * The bootstrap PIN, replaced.
 *
 * A card is issued with a PIN the office reads out — like an ATM card, it is
 * worthless until the holder replaces it. `portal_accounts.must_change_pin`
 * stays true until they do, and the portal layout sends them here every time
 * until it is false.
 */
export default async function SetPinPage() {
  const session = await requirePortalSession();
  const copy = t(session.locale);

  return (
    <div className="grid min-h-svh place-items-center p-5">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="items-center gap-2 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <ShieldCheck className="size-6" />
          </div>
          <CardTitle className="text-lg">{copy.setPinTitle}</CardTitle>
          <CardDescription className="text-pretty">
            {copy.setPinLead}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SetPinForm locale={session.locale} />
        </CardContent>
      </Card>
    </div>
  );
}
