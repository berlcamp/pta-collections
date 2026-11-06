import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CashierNav } from "@/components/cashier/cashier-nav";
import { SchoolSwitcher } from "@/components/layout/school-switcher";
import { SignOutButton } from "@/components/auth/sign-out-button";

/** Tenant-scoped and authenticated, the same as the (app) group (D20). */
export const dynamic = "force-dynamic";

/**
 * The cashier's workspace: a top bar and three pages, with none of the sidebar,
 * modules or theme toggle the rest of the staff app carries.
 *
 * Every role that can take money may open it. Only a cashier is sent here and
 * kept here, by app/(app)/layout.tsx. The role check below keeps a viewer out,
 * and create_payment checks again underneath.
 */
export default async function CashierLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole(["admin", "cashier", "treasurer"]);

  const supabase = await createClient();
  const { count } = await supabase
    .from("payment_claims")
    .select("id", { count: "exact", head: true })
    .eq("school_id", session.activeSchool.id)
    .eq("status", "submitted");

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-30 border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 sm:px-6">
          <SchoolSwitcher session={session} />
          <CashierNav pendingClaims={count ?? 0} />
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground md:inline">
              {session.profile.full_name}
            </span>
            <SignOutButton variant="ghost" />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
