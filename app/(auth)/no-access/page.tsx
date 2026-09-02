import { ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/auth/sign-out-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

/**
 * Where an account with no way into the app lands.
 *
 * Two different people arrive here and they need different answers:
 *
 *   1. No `pta` profile at all — an uninvited Google account. The signed-in
 *      email is shown deliberately: the most common support case is someone
 *      invited at a school address who signs in with a personal Gmail, and
 *      naming the address they actually used turns a mystery into a one-message
 *      fix.
 *
 *   2. A profile, but no active membership in an active school — their access
 *      was removed, or the school itself was deactivated. Telling this person
 *      they were "never invited" sends them hunting for a second email account
 *      that does not exist, so they get their own message.
 *
 * proxy.ts uses the same predicate to decide who may stay on this page; the two
 * must agree or the user bounces between here and /dashboard.
 */
export default async function NoAccessPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("auth_user_id", user.id)
        .maybeSingle()
    : { data: null };

  const provisioned = Boolean(profile);

  return (
    <Card className="w-full shadow-xl">
      <CardHeader className="items-center gap-2 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-destructive/10 text-destructive">
          <ShieldAlert className="size-7" />
        </div>
        <CardTitle className="text-xl">No access</CardTitle>
        <CardDescription>
          {provisioned
            ? "This account is not currently assigned to any school."
            : "This account has not been invited to any school on Smart Campus."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {user?.email && (
          <div className="rounded-lg border bg-muted/50 p-3 text-sm">
            You signed in as{" "}
            <span className="font-medium break-all">{user.email}</span>.{" "}
            {provisioned ? (
              <>
                Your account exists, but it holds no active membership in an
                active school.
                <p className="mt-2 text-muted-foreground">
                  This usually means your access was withdrawn, or the school
                  you belonged to was deactivated. Ask a PTA admin or the system
                  Super Admin to reinstate you.
                </p>
              </>
            ) : (
              <>
                No invitation exists for this address.
                <p className="mt-2 text-muted-foreground">
                  If you were invited using a different email — a school
                  address, for example — sign out and sign in with that one
                  instead.
                </p>
              </>
            )}
          </div>
        )}
        <SignOutButton className="w-full" />
      </CardContent>
    </Card>
  );
}
