import type { Capability } from "@/lib/auth/permissions";

/**
 * Navigation definition.
 *
 * `icon` is a NAME, not a component reference. This module is consumed by the
 * server-rendered AppShell and handed to client components, and React only
 * allows plain serializable objects across that boundary — passing a lucide
 * component throws "Only plain objects can be passed to Client Components".
 * components/layout/nav-icon.tsx resolves the name back to a component.
 *
 * The sidebar lists MODULES only. A module's pages live in `children` and are
 * surfaced as a tab strip at the top of the module (components/layout/
 * module-tabs.tsx), which keeps the rail short enough to scan at a glance.
 * Pages already reachable from a button inside the module — Add student,
 * Import students, New payment — are deliberately absent from both.
 */
export type NavIconName =
  | "LayoutDashboard"
  | "GraduationCap"
  | "UserPlus"
  | "Upload"
  | "Wallet"
  | "Receipt"
  | "Banknote"
  | "BadgePercent"
  | "HeartHandshake"
  | "HandCoins"
  | "Target"
  | "Gift"
  | "ListChecks"
  | "ClipboardList"
  | "FileText"
  | "FileBarChart"
  | "FileSpreadsheet"
  | "Users"
  | "ScrollText"
  | "CalendarRange"
  | "BookUser"
  | "ShieldCheck"
  | "Settings"
  | "Building2"
  | "ScanLine"
  | "Radio"
  | "IdCard"
  | "Smartphone"
  | "Inbox";

export interface NavItem {
  label: string;
  href: string;
  icon: NavIconName;
  /** When set, the item is hidden unless the role has this capability.
   *  Hiding is cosmetic — every route re-checks server-side. */
  capability?: Capability;
}

export interface NavModule extends NavItem {
  /** Pages inside this module, rendered as tabs rather than sidebar rows.
   *  A module with fewer than two visible children renders no tab strip. */
  children?: NavItem[];
}

export interface NavGroup {
  /** Omitted when the group needs no heading — with six modules the rail
   *  reads better as one flat list. */
  label?: string;
  items: NavModule[];
}

export const SCHOOL_NAV: NavGroup[] = [
  {
    items: [
      { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
      {
        // Add and Import are buttons in this page's header, not nav rows.
        label: "Students",
        href: "/students",
        icon: "GraduationCap",
      },
      {
        label: "Collections",
        href: "/collections",
        icon: "Wallet",
        children: [
          { label: "Payment history", href: "/collections", icon: "Receipt" },
          { label: "Today's collections", href: "/collections/today", icon: "Banknote" },
          // Parent-submitted GCash transfers awaiting confirmation. A tab under
          // Collections rather than its own module, because approving one runs
          // create_payment() and lands in the same receipt series and the same
          // daily total as anything taken at the counter.
          { label: "Online payments", href: "/collections/claims", icon: "Inbox", capability: "reviewClaims" },
        ],
      },
      {
        label: "Charges",
        href: "/charges/outstanding",
        icon: "ClipboardList",
        children: [
          { label: "Outstanding dues", href: "/charges/outstanding", icon: "FileText" },
          { label: "Fee types", href: "/charges/fees", icon: "BadgePercent", capability: "manageFeeTypes" },
          { label: "Assess annual fees", href: "/charges/assess", icon: "ListChecks", capability: "assessFees" },
          { label: "Student penalties", href: "/charges/penalties", icon: "ClipboardList", capability: "createPenalty" },
        ],
      },
      {
        // Donations are deliberately their OWN module rather than a tab under
        // Collections: nothing here is an obligation, none of it settles a
        // charge, and it is numbered in a separate receipt series. Filing it
        // under Collections would invite exactly the confusion the schema
        // works to prevent.
        label: "Projects & Programs",
        // Points at the Programs tab, following the same rule as Charges and
        // Reports: a module's href is its FIRST child. What a PTA officer wants
        // on landing here is how each fundraiser is tracking, not a
        // reverse-chronological list of individual gifts.
        href: "/donations/programs",
        icon: "HeartHandshake",
        children: [
          { label: "Programs", href: "/donations/programs", icon: "Target" },
          { label: "Donations received", href: "/donations", icon: "HandCoins" },
          { label: "Pledges", href: "/donations/pledges", icon: "ListChecks" },
          { label: "Donors", href: "/donations/donors", icon: "Users" },
        ],
      },
      {
        label: "Reports",
        href: "/reports/collections",
        icon: "FileBarChart",
        children: [
          { label: "Collections", href: "/reports/collections", icon: "FileBarChart" },
          { label: "Fee types", href: "/reports/fee-types", icon: "FileSpreadsheet" },
          { label: "Cashiers", href: "/reports/cashiers", icon: "Users" },
          { label: "Donations", href: "/reports/donations", icon: "Gift" },
          { label: "Annual PTA report", href: "/reports/annual", icon: "ScrollText" },
        ],
      },
      {
        label: "Administration",
        href: "/admin/settings",
        icon: "Settings",
        children: [
          { label: "Settings", href: "/admin/settings", icon: "Settings", capability: "manageSchoolSettings" },
          { label: "School years", href: "/admin/school-years", icon: "CalendarRange", capability: "manageSchoolYears" },
          { label: "Sections", href: "/admin/sections", icon: "BookUser", capability: "manageSections" },
          { label: "Users", href: "/admin/users", icon: "Users", capability: "manageUsers" },
          { label: "Parent cards", href: "/admin/parent-cards", icon: "Smartphone", capability: "issueParentCard" },
          { label: "Audit logs", href: "/admin/audit-logs", icon: "ShieldCheck", capability: "viewAuditLogs" },
        ],
      },
    ],
  },
];

export const SUPER_NAV: NavGroup[] = [
  {
    label: "Global",
    items: [
      {
        label: "Super admin",
        href: "/super",
        icon: "Building2",
        children: [
          { label: "Overview", href: "/super", icon: "LayoutDashboard" },
          { label: "Schools", href: "/super/schools", icon: "Building2" },
        ],
      },
      {
        // The RFID gate. Its own module rather than a tab under Super admin:
        // nothing here is money, and the two pages are used by different people
        // at different times — the monitor during the morning rush, enrolment
        // when a card is handed over. Both are school-scoped by a picker on the
        // page, because a super admin arrives here without an active school.
        label: "Gate attendance",
        href: "/super/attendance",
        icon: "ScanLine",
        children: [
          { label: "Live monitor", href: "/super/attendance", icon: "Radio" },
          { label: "Card enrolment", href: "/super/cards", icon: "IdCard" },
        ],
      },
    ],
  },
];

/** Longest matching href wins, so /collections/today resolves to its own entry
 *  rather than to the /collections parent. */
function bestMatch<T extends { href: string }>(pathname: string, items: T[]): T | null {
  let best: T | null = null;
  for (const item of items) {
    if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
      if (!best || item.href.length > best.href.length) best = item;
    }
  }
  return best;
}

/** The module a path belongs to, matched against the module href and every
 *  child href so /charges/fees resolves to Charges. */
export function moduleFor(pathname: string, groups: NavGroup[]): NavModule | null {
  const candidates = groups.flatMap((g) =>
    g.items.flatMap((m) => [
      { href: m.href, module: m },
      ...(m.children ?? []).map((c) => ({ href: c.href, module: m })),
    ]),
  );
  return bestMatch(pathname, candidates)?.module ?? null;
}

/** The child page within a module that the path is on, if any. */
export function childFor(pathname: string, mod: NavModule): NavItem | null {
  return bestMatch(pathname, mod.children ?? []);
}
