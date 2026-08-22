import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import type { SessionContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { SCHOOL_NAV, SUPER_NAV, type NavGroup, type NavModule } from "@/lib/nav";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AppSidebar } from "./app-sidebar";
import { AppBreadcrumbs } from "./app-breadcrumbs";
import { ModuleTabs } from "./module-tabs";
import { SidebarUserMenu } from "./sidebar-user-menu";
import { SchoolSwitcher } from "./school-switcher";
import { ThemeToggle } from "./theme-toggle";
import { SuperAdminBanner } from "./super-admin-banner";

export async function AppShell({
  session,
  children,
}: {
  session: SessionContext;
  children: React.ReactNode;
}) {
  const { activeSchool, activeRole, isSuperAdmin, actingAsSuperAdmin } = session;

  // Filter by capability. Cosmetic only — every route re-checks server-side.
  const permitted = (item: { capability?: NavModule["capability"] }) =>
    !item.capability || can(activeRole, item.capability);

  const prune = (source: NavGroup[]): NavGroup[] =>
    source
      .map((g) => ({
        ...g,
        items: g.items.flatMap<NavModule>((m) => {
          if (!m.children) return permitted(m) ? [m] : [];
          const children = m.children.filter(permitted);
          if (children.length === 0) return [];
          // The module row must land somewhere the role may actually go, so a
          // gated landing page falls back to the first child it can see.
          const href = children.some((c) => c.href === m.href)
            ? m.href
            : children[0].href;
          return [{ ...m, href, children }];
        }),
      }))
      .filter((g) => g.items.length > 0);

  const groups = prune(activeSchool ? SCHOOL_NAV : []);
  const allGroups = isSuperAdmin ? [...groups, ...prune(SUPER_NAV)] : groups;

  // The switcher lists every active school for a super admin. RLS already
  // limits this to what they may see, so no extra filtering is needed here.
  let allSchools;
  if (isSuperAdmin) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("schools")
      .select("*")
      .eq("active", true)
      .order("name");
    allSchools = data ?? undefined;
  }

  // Read the collapse state on the server so a collapsed rail does not flash
  // open on first paint. The cookie name is the one SidebarProvider writes.
  const store = await cookies();
  const defaultOpen = store.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar
        groups={allGroups}
        schoolName={activeSchool?.name}
        footer={<SidebarUserMenu session={session} />}
      />

      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-md">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-5" />
          <AppBreadcrumbs groups={allGroups} />
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <SchoolSwitcher session={session} allSchools={allSchools} />
            <ThemeToggle />
          </div>
        </header>

        {actingAsSuperAdmin && activeSchool && (
          <SuperAdminBanner schoolName={activeSchool.name} />
        )}

        <main className="min-w-0 flex-1 p-4 md:p-6 lg:p-8">
          <ModuleTabs groups={allGroups} />
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
