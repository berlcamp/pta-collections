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
  // Donations mirror the payment split exactly: the three roles that can take
  // money can take a donation, and only the two that can reverse a payment can
  // reverse one. A program is configuration, so it is admin-only like fee types.
  manageProgram: ["admin"],
  recordDonation: ["admin", "cashier", "treasurer"],
  voidDonation: ["admin", "treasurer"],
  recordPledge: ["admin", "cashier", "treasurer"],
  cancelPledge: ["admin", "treasurer"],
  manageDonors: ["admin", "treasurer"],
  viewReports: ["admin", "treasurer", "viewer", "cashier"],
  exportReports: ["admin", "treasurer"],
  viewAuditLogs: ["admin", "treasurer"],
  // Parent portal. Issuing a card is an IDENTITY decision — it decides who can
  // watch a child through the school gate — so cashiers are excluded even
  // though they may take money all day. Reviewing a claim is the same act as
  // taking a payment at the counter, so it carries the same three roles.
  issueParentCard: ["admin", "treasurer"],
  reviewClaims: ["admin", "cashier", "treasurer"],
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
