"use client";

import { useRouter } from "next/navigation";
import { ChevronsUpDown, LogOut, ShieldCheck } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import type { SessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/browser";

export function initialsOf(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * Account control docked at the foot of the dark rail. The trigger is painted
 * with sidebar tokens; the menu itself is a portalled popover, so it keeps the
 * page's own surface colours.
 */
export function SidebarUserMenu({ session }: { session: SessionContext }) {
  const router = useRouter();
  const { isMobile } = useSidebar();
  const { profile, isSuperAdmin, activeRole } = session;

  async function signOut() {
    const supabase = createClient();
    // Scope 'local' clears only this app's namespaced session (storageKey
    // 'pta-auth'), leaving other apps on this shared Supabase project alone.
    await supabase.auth.signOut({ scope: "local" });
    router.push("/login");
    router.refresh();
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-open:bg-sidebar-accent"
            >
              <Avatar className="size-8 rounded-lg">
                {profile.avatar_url && (
                  <AvatarImage src={profile.avatar_url} alt="" />
                )}
                <AvatarFallback className="rounded-lg bg-sidebar-primary text-xs text-sidebar-primary-foreground">
                  {initialsOf(profile.full_name)}
                </AvatarFallback>
              </Avatar>
              <div className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="truncate text-sm font-medium">
                  {profile.full_name}
                </span>
                <span className="truncate text-xs text-sidebar-foreground/60">
                  {activeRole ? ROLE_LABELS[activeRole] : "Super Admin"}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 opacity-60" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={8}
            className="w-64"
          >
            <DropdownMenuLabel className="space-y-1">
              <p className="text-sm font-medium">{profile.full_name}</p>
              <p className="truncate text-xs font-normal text-muted-foreground">
                {profile.email}
              </p>
              <div className="flex flex-wrap gap-1 pt-1">
                {isSuperAdmin && (
                  <Badge variant="secondary" className="gap-1">
                    <ShieldCheck className="size-3" />
                    Super Admin
                  </Badge>
                )}
                {activeRole && (
                  <Badge variant="outline">{ROLE_LABELS[activeRole]}</Badge>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={signOut} variant="destructive">
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
