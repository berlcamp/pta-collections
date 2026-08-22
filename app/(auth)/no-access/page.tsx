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
 * Where every uninvited Google account lands.
 *
 * The signed-in email is shown deliberately: the single most common support
 * case is someone invited at a school address who signs in with a personal
 * Gmail. Naming the address they actually used turns a mystery into a
 * one-message fix.
 */
export default async function NoAccessPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <Card className="w-full shadow-xl">
      <CardHeader className="items-center gap-2 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-destructive/10 text-destructive">
          <ShieldAlert className="size-7" />
        </div>
        <CardTitle className="text-xl">No access</CardTitle>
        <CardDescription>
          This account has not been invited to any school in the PTA Collection
          System.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {user?.email && (
          <div className="rounded-lg border bg-muted/50 p-3 text-sm">
            You signed in as{" "}
            <span className="font-medium break-all">{user.email}</span>. No
            invitation exists for this address.
            <p className="mt-2 text-muted-foreground">
              If you were invited using a different email — a school address,
              for example — sign out and sign in with that one instead.
            </p>
          </div>
        )}
        <SignOutButton className="w-full" />
      </CardContent>
    </Card>
  );
}
