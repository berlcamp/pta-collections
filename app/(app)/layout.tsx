import { requireSession } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";

/**
 * Fully dynamic (D20). Every page below this layout is authenticated and
 * tenant-scoped; a cached fragment leaking School A's data into a School B
 * request is exactly the breach RLS exists to prevent.
 */
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  return <AppShell session={session}>{children}</AppShell>;
}
