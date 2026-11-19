import { requireRole } from "@/lib/auth/session";
import { TeacherNav } from "@/components/teacher/teacher-nav";
import { SignOutButton } from "@/components/auth/sign-out-button";

/** Tenant-scoped and authenticated, the same as the (app) group (D20). */
export const dynamic = "force-dynamic";

/**
 * A teacher's whole workspace: their sections' gate attendance, in the same
 * blue-gradient shell as the cashier desk and the parent portal.
 *
 * A teacher is sent here and kept here by app/(app)/layout.tsx. An admin may
 * open it by URL to check what an adviser sees; it reads through the same
 * section-checked functions either way (0030).
 */
export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole(["teacher", "admin"]);

  return (
    <div className="cashier-page flex min-h-svh flex-col text-slate-900">
      <header className="text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-3 px-4 pt-4 pb-5 sm:px-6">
          <TeacherNav />

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

      <footer className="pb-5 text-center text-xs text-blue-100/80">
        {session.activeSchool.name}
      </footer>
    </div>
  );
}
