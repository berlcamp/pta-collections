"use client";

import {
  BadgePercent,
  Banknote,
  BookUser,
  Building2,
  CalendarRange,
  ClipboardList,
  FileBarChart,
  FileSpreadsheet,
  FileText,
  Gift,
  GraduationCap,
  HandCoins,
  HeartHandshake,
  LayoutDashboard,
  ListChecks,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  Target,
  Upload,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { NavIconName } from "@/lib/nav";

/**
 * Resolves a serializable icon name into a component, on the client side of
 * the boundary. See the comment in lib/nav.ts for why the name is what crosses.
 */
const ICONS: Record<NavIconName, LucideIcon> = {
  LayoutDashboard,
  GraduationCap,
  UserPlus,
  Upload,
  Wallet,
  Receipt,
  Banknote,
  BadgePercent,
  HeartHandshake,
  HandCoins,
  Target,
  Gift,
  ListChecks,
  ClipboardList,
  FileText,
  FileBarChart,
  FileSpreadsheet,
  Users,
  ScrollText,
  CalendarRange,
  BookUser,
  ShieldCheck,
  Settings,
  Building2,
};

export function NavIcon({
  name,
  className,
}: {
  name: NavIconName;
  className?: string;
}) {
  const Icon = ICONS[name] ?? LayoutDashboard;
  return <Icon className={className} />;
}
