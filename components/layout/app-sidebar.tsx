"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap } from "lucide-react";

import { cn } from "@/lib/utils";
import { dynamicRoute } from "@/lib/routes";
import { moduleFor, type NavGroup } from "@/lib/nav";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { NavIcon } from "./nav-icon";

export function AppSidebar({
  groups,
  schoolName,
  footer,
}: {
  groups: NavGroup[];
  schoolName?: string;
  footer?: React.ReactNode;
}) {
  const pathname = usePathname();
  const { setOpenMobile, isMobile } = useSidebar();

  // The whole module lights up for any page inside it, so /charges/fees keeps
  // Charges highlighted even though the row points at Outstanding dues.
  const current = moduleFor(pathname, groups);

  function close() {
    if (isMobile) setOpenMobile(false);
  }

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="border-b border-sidebar-border p-0">
        <div className="flex h-16 items-center gap-3 px-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
            <GraduationCap className="size-5" />
          </div>
          <Link
            href="/dashboard"
            onClick={close}
            className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden"
          >
            <span className="block truncate text-sm font-semibold text-sidebar-foreground">
              PTA Collection
            </span>
            <span className="block truncate text-xs text-sidebar-foreground/60">
              {schoolName ?? "Global administration"}
            </span>
          </Link>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0 py-2">
        {groups.map((group) => (
          <SidebarGroup key={group.label ?? "main"} className="py-1">
            {group.label && (
              <SidebarGroupLabel className="text-[0.7rem] font-semibold tracking-widest text-sidebar-foreground/45 uppercase">
                {group.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map((item) => {
                  const isActive = current === item;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.label}
                        className={cn(
                          "h-9 text-sidebar-foreground/80",
                          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                          isActive &&
                            "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                        )}
                      >
                        <Link href={dynamicRoute(item.href)} onClick={close}>
                          {/* The rail marks the active item without relying on
                              colour alone. */}
                          <span
                            aria-hidden
                            className={cn(
                              "absolute inset-y-1 left-0 w-0.5 rounded-full bg-sidebar-primary transition-opacity",
                              isActive ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <NavIcon
                            name={item.icon}
                            className={cn(
                              "size-4 shrink-0",
                              isActive
                                ? "text-sidebar-primary"
                                : "text-sidebar-foreground/60",
                            )}
                          />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {footer && (
        <SidebarFooter className="border-t border-sidebar-border p-2">
          {footer}
        </SidebarFooter>
      )}
      <SidebarRail />
    </Sidebar>
  );
}
