import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CashierNav } from "@/components/cashier/cashier-nav";
import { SignOutButton } from "@/components/auth/sign-out-button";

/** Tenant-scoped and authenticated, the same as the (app) group (D20). */
export const dynamic = "force-dynamic";

/**
 * The cashier's workspace: a top bar and three pages, with none of the sidebar,
 * modules or theme toggle the rest of the staff app carries.
 *
 * Drawn in the parent portal's look — the blue gradient behind everything, the
 * bar sitting straight on it, the work on one pale rounded panel — because the
 * desk is the other end of the same transaction: a parent pays at the portal
 * or at this counter, and both should feel like the same school's app.
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
    <div className="cashier-page flex min-h-svh flex-col text-slate-900">
      <header className="text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-3 px-4 pt-4 pb-5 sm:px-6">
          <CashierNav pendingClaims={count ?? 0} />

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-sm font-medium text-blue-100 md:inline">
              {session.profile.full_name}
            </span>
            <SignOutButton
              variant="ghost"
              className="h-11 rounded-full bg-white/12 px-4 text-white ring-1 ring-white/20 hover:bg-white/20 hover:text-white"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-3 pb-8 sm:px-6">
        <div className="portal-sheet min-h-[calc(100svh-7rem)] rounded-[2rem] p-4 shadow-2xl shadow-blue-950/30 sm:p-8">
          {children}
        </div>
      </main>

      {/* The school is named once, quietly, down here: the desk serves one
          school and the cashier knows which. There is deliberately no school
          switcher on this desk. */}
      <footer className="pb-5 text-center text-xs text-blue-100/80">
        {session.activeSchool.name}
      </footer>
    </div>
  );
}
