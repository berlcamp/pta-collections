/**
 * Domain types for the `pta` schema.
 *
 * Hand-written rather than generated: `supabase gen types` needs the project
 * linked, and linking a SHARED project invites the whole-database tooling we
 * have banned (see CLAUDE.md). Keep this file in step with supabase/migrations.
 */

export type GlobalRole = "super_admin" | "user";
export type SchoolRole = "admin" | "cashier" | "treasurer" | "viewer";
export type MembershipStatus = "active" | "inactive";
export type InviteStatus = "pending" | "accepted" | "revoked" | "expired";
export type FeeCategory = "annual" | "penalty" | "special" | "other";
export type ChargeStatus = "active" | "waived" | "cancelled";
export type DerivedPaymentStatus =
  | "unpaid"
  | "partially_paid"
  | "paid"
  | "waived"
  | "cancelled";
export type PaymentMethod = "cash" | "gcash" | "bank_transfer" | "other";
export type PaymentStatus = "posted" | "voided";
export type StudentStatus =
  | "active"
  | "inactive"
  | "graduated"
  | "transferred_out";
export type EnrollmentStatus =
  | "enrolled"
  | "transferred_out"
  | "dropped"
  | "graduated";
export type ImportBatchStatus =
  | "uploaded"
  | "validated"
  | "committed"
  | "failed"
  | "cancelled";
export type ImportRowStatus = "valid" | "error" | "duplicate" | "matched";

export interface Profile {
  id: string;
  auth_user_id: string | null;
  email: string;
  full_name: string;
  avatar_url: string | null;
  global_role: GlobalRole;
  created_at: string;
  updated_at: string;
}

export interface School {
  id: string;
  school_code: string;
  name: string;
  short_name: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  region: string | null;
  contact_number: string | null;
  email: string | null;
  logo_url: string | null;
  receipt_prefix: string;
  receipt_footer_text: string | null;
  timezone: string;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SchoolUser {
  id: string;
  school_id: string;
  profile_id: string;
  role: SchoolRole;
  status: MembershipStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SchoolUserInvite {
  id: string;
  school_id: string;
  email: string;
  full_name: string;
  role: SchoolRole;
  status: InviteStatus;
  expires_at: string;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SchoolYear {
  id: string;
  school_id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Section {
  id: string;
  school_id: string;
  school_year_id: string;
  grade_level: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface GradeLevel {
  code: string;
  label: string;
  sort_order: number;
}

export interface Student {
  id: string;
  school_id: string;
  lrn: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  birth_date: string | null;
  sex: "M" | "F" | null;
  status: StudentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudentEnrollment {
  id: string;
  school_id: string;
  student_id: string;
  school_year_id: string;
  section_id: string | null;
  grade_level: string;
  student_number: string | null;
  status: EnrollmentStatus;
  created_at: string;
  updated_at: string;
}

export interface Guardian {
  id: string;
  school_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  contact_number: string | null;
  email: string | null;
  address: string | null;
  occupation: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudentGuardian {
  id: string;
  school_id: string;
  student_id: string;
  guardian_id: string;
  relationship: string;
  is_primary: boolean;
  created_at: string;
}

export interface FeeType {
  id: string;
  school_id: string;
  name: string;
  description: string | null;
  category: FeeCategory;
  default_amount: number | null;
  is_recurring: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StudentCharge {
  id: string;
  school_id: string;
  student_id: string;
  school_year_id: string;
  fee_type_id: string;
  description: string | null;
  amount: number;
  waived_amount: number;
  due_date: string | null;
  status: ChargeStatus;
  status_reason: string | null;
  created_at: string;
  updated_at: string;
}

/** pta.v_student_charge_balances — the single source of truth for balances. */
export interface ChargeBalance {
  id: string;
  school_id: string;
  student_id: string;
  school_year_id: string;
  fee_type_id: string;
  fee_type_name: string;
  fee_category: FeeCategory;
  description: string | null;
  amount: number;
  waived_amount: number;
  due_date: string | null;
  status: ChargeStatus;
  status_reason: string | null;
  created_at: string;
  paid: number;
  balance: number;
  payment_status: DerivedPaymentStatus;
}

export interface Payment {
  id: string;
  school_id: string;
  receipt_number: string;
  student_id: string;
  school_year_id: string;
  payment_date: string;
  total_amount: number;
  amount_tendered: number | null;
  change_amount: number | null;
  payment_method: PaymentMethod;
  reference_number: string | null;
  remarks: string | null;
  collected_by: string;
  status: PaymentStatus;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  acting_as_super_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaymentItem {
  id: string;
  school_id: string;
  payment_id: string;
  student_charge_id: string;
  amount: number;
}

export interface AuditLog {
  id: string;
  school_id: string | null;
  profile_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  acting_as_super_admin: boolean;
  created_at: string;
}

export interface ImportBatch {
  id: string;
  school_id: string;
  school_year_id: string;
  filename: string;
  uploaded_by: string;
  status: ImportBatchStatus;
  update_enrollment: boolean;
  total_rows: number;
  valid_rows: number;
  matched_rows: number;
  duplicate_rows: number;
  error_rows: number;
  created_students: number;
  created_guardians: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImportRow {
  id: string;
  batch_id: string;
  school_id: string;
  row_number: number;
  raw: Record<string, string>;
  normalized: NormalizedImportRow | null;
  status: ImportRowStatus;
  errors: string[] | null;
  matched_student_id: string | null;
}

export interface NormalizedImportRow {
  lrn: string | null;
  student_number: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  birth_date: string | null;
  sex: "M" | "F" | null;
  grade_level: string;
  section: string | null;
  /**
   * At most ONE entry: a student takes a single guardian. Kept as an array
   * because that is the shape pta.commit_import_batch already iterates.
   */
  guardians: {
    name: string;
    contact: string | null;
    relationship: string;
    is_primary: boolean;
  }[];
}

/** Minimal shape the Supabase client needs; RPC args/returns are typed at call sites. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
