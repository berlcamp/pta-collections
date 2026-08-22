import type { SchoolRole } from "@/types/database.types";

/**
 * Role capabilities.
 *
 * This drives navigation and button visibility ONLY. Every one of these is
 * enforced again server-side (requireRole) and a third time by RLS or by the
 * RPC itself. Hiding a control is never the control.
 */
export const CAPABILITIES = {
  manageSchoolSettings: ["admin"],
  manageUsers: ["admin"],
  manageSchoolYears: ["admin"],
  manageSections: ["admin"],
  manageFeeTypes: ["admin"],
  manageStudents: ["admin"],
  importStudents: ["admin"],
  assessFees: ["admin"],
  createPenalty: ["admin", "treasurer"],
  waiveCharge: ["admin"],
  recordPayment: ["admin", "cashier", "treasurer"],
  voidPayment: ["admin", "treasurer"],
  viewReports: ["admin", "treasurer", "viewer", "cashier"],
  exportReports: ["admin", "treasurer"],
  viewAuditLogs: ["admin", "treasurer"],
} as const satisfies Record<string, readonly SchoolRole[]>;

export type Capability = keyof typeof CAPABILITIES;

export function can(role: SchoolRole | null, capability: Capability): boolean {
  if (!role) return false;
  return (CAPABILITIES[capability] as readonly SchoolRole[]).includes(role);
}

export const ROLE_LABELS: Record<SchoolRole, string> = {
  admin: "Administrator",
  cashier: "Cashier",
  treasurer: "Treasurer",
  viewer: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<SchoolRole, string> = {
  admin: "Full access to the school: users, students, fees, payments and voids.",
  cashier: "Records payments and prints receipts. Cannot void.",
  treasurer: "Reviews collections, runs reports, and may void payments.",
  viewer: "Read-only access to students, payments and reports.",
};
