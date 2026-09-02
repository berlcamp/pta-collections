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

/* -------------------------------------------------------------------------- */
/*  Donations — PTA programs and voluntary giving (migration 0014)            */
/* -------------------------------------------------------------------------- */

export type ProgramCategory =
  | "program"
  | "activity"
  | "project"
  | "fund"
  | "other";
export type ProgramStatus = "planned" | "open" | "closed" | "cancelled";
export type DonorType =
  | "guardian"
  | "alumnus"
  | "staff"
  | "business"
  | "government"
  | "organization"
  | "other";
/** Cash is money in the drawer; in-kind is goods or services at an estimated
 *  value. They are never added together in a cash total. */
export type DonationKind = "cash" | "in_kind";
export type DonationStatus = "posted" | "voided";
/** Human-set only, exactly like ChargeStatus. Fulfilment is derived. */
export type PledgeStatus = "open" | "cancelled";
export type PledgeFulfilment =
  | "open"
  | "partially_fulfilled"
  | "fulfilled"
  | "cancelled";

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

export interface DonationProgram {
  id: string;
  school_id: string;
  school_year_id: string;
  name: string;
  description: string | null;
  category: ProgramCategory;
  target_amount: number | null;
  starts_on: string | null;
  ends_on: string | null;
  status: ProgramStatus;
  status_reason: string | null;
  accepts_pledges: boolean;
  accepts_in_kind: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** pta.v_donation_program_totals — the progress figures behind every program. */
export interface ProgramTotals {
  program_id: string;
  school_id: string;
  school_year_id: string;
  name: string;
  description: string | null;
  category: ProgramCategory;
  status: ProgramStatus;
  target_amount: number | null;
  starts_on: string | null;
  ends_on: string | null;
  accepts_pledges: boolean;
  accepts_in_kind: boolean;
  created_at: string;
  cash_received: number;
  in_kind_value: number;
  total_received: number;
  donation_count: number;
  donor_count: number;
  pledged_total: number;
  pledge_outstanding: number;
  /** Null when the program has no target; capped at 100. */
  progress_pct: number | null;
}

export interface Donor {
  id: string;
  school_id: string;
  donor_type: DonorType;
  display_name: string;
  guardian_id: string | null;
  student_id: string | null;
  contact_number: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Donation {
  id: string;
  school_id: string;
  school_year_id: string;
  program_id: string;
  /** Null for an anonymous donation — and only then. */
  donor_id: string | null;
  pledge_id: string | null;
  acknowledgement_number: string;
  donation_date: string;
  kind: DonationKind;
  /** For in-kind, the estimated peso value rather than money received. */
  amount: number;
  payment_method: PaymentMethod | null;
  reference_number: string | null;
  item_description: string | null;
  is_anonymous: boolean;
  remarks: string | null;
  received_by: string;
  status: DonationStatus;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  acting_as_super_admin: boolean;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface DonationPledge {
  id: string;
  school_id: string;
  school_year_id: string;
  program_id: string;
  donor_id: string;
  pledged_amount: number;
  due_date: string | null;
  status: PledgeStatus;
  status_reason: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** pta.v_donation_pledge_status — fulfilment derived from posted donations. */
export interface PledgeStatusRow {
  id: string;
  school_id: string;
  school_year_id: string;
  program_id: string;
  program_name: string;
  donor_id: string;
  donor_name: string;
  donor_contact: string | null;
  pledged_amount: number;
  due_date: string | null;
  status: PledgeStatus;
  status_reason: string | null;
  notes: string | null;
  created_at: string;
  fulfilled_amount: number;
  fulfilled_cash: number;
  fulfilled_in_kind: number;
  remaining_amount: number;
  fulfilment_status: PledgeFulfilment;
}

/** pta.v_donor_totals — giving history per donor, per school year. */
export interface DonorTotals {
  donor_id: string;
  school_id: string;
  school_year_id: string;
  display_name: string;
  donor_type: DonorType;
  contact_number: string | null;
  guardian_id: string | null;
  student_id: string | null;
  cash_given: number;
  in_kind_given: number;
  total_given: number;
  donation_count: number;
  program_count: number;
  last_donation_at: string;
}

/* -------------------------------------------------------------------------- */
/*  RFID attendance gate — the ESP32 school-gate reader (migrations 0013/0015) */
/* -------------------------------------------------------------------------- */

/** A tap is a MOVEMENT past the reader, not a presence claim. With one reader
 *  at one gate, "arrived" is a rule this app applies to the first scan of the
 *  day — it is not something the hardware measured. */
export type ScanDirection = "in" | "out";

export interface GateDevice {
  device_id: string;
  school_id: string;
  label: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** pta.v_gate_device_status — the registry plus liveness. */
export interface GateDeviceStatus {
  device_id: string;
  school_id: string;
  label: string | null;
  active: boolean;
  created_at: string;
  /** The device's claim. Null when it has never delivered a scan. */
  last_scan_at: string | null;
  /** When the server actually saw it. Diverges from last_scan_at by the
   *  length of the last outage. */
  last_received_at: string | null;
  scans_today: number;
}

export interface StudentCard {
  id: string;
  school_id: string;
  student_id: string;
  card_uid: string;
  issued_at: string;
  /** Set rather than deleted, so past attendance keeps resolving to whoever
   *  actually held the card that day. */
  revoked_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** pta.v_student_cards_detail — an issued card with its holder attached. */
export interface StudentCardDetail {
  id: string;
  school_id: string;
  student_id: string;
  card_uid: string;
  issued_at: string;
  revoked_at: string | null;
  created_at: string;
  student_name: string;
  student_no: string | null;
  /** Null once the holder is no longer on the active year's roster. */
  grade_level: string | null;
  section_name: string | null;
  last_used_at: string | null;
}

/** pta.v_attendance_local — a resolved scan with the school-local date (D11).
 *  student_id is null when the card belongs to nobody: an unknown card. */
export interface AttendanceScan {
  event_id: string;
  school_id: string;
  card_uid: string;
  device_id: string;
  scanned_at: string;
  received_at: string;
  /** False = the device had no NTP yet and this time was reconstructed from
   *  boot_epoch + uptime. Shown, never silently trusted. */
  clock_synced: boolean;
  direction: ScanDirection;
  /** True = the scan arrived after an outage rather than in real time. */
  queued: boolean;
  image_path: string | null;
  student_id: string | null;
  full_name: string | null;
  student_no: string | null;
  grade_level: string | null;
  section_name: string | null;
  local_date: string;
  local_month: string;
  school_timezone: string;
}

/** pta.v_unassigned_cards — the enrolment queue: plastic tapped at this school
 *  that no active card row currently holds. */
export interface UnassignedCard {
  school_id: string;
  card_uid: string;
  scan_count: number;
  first_seen_at: string;
  last_seen_at: string;
  last_device_id: string | null;
}

/** pta.gate_roster — students enrolled in their school's ACTIVE school year. */
export interface GateRosterEntry {
  school_id: string;
  student_id: string;
  full_name: string;
  student_no: string | null;
  grade_level: string | null;
  section_name: string | null;
  school_year_id: string;
}

/* ---------------------------------------------------------------------------
 * Parent/Guardian portal (0016)
 * ------------------------------------------------------------------------- */

export type PortalAccountStatus = "active" | "revoked";
export type PortalLocale = "en" | "tl";
export type ClaimType = "fee" | "donation";
export type ClaimStatus = "submitted" | "approved" | "rejected";
/** GCash and bank transfer only: a portal claim is money already sent. */
export type ClaimMethod = "gcash" | "bank_transfer" | "other";

/** pta.v_portal_account — the guardian's own account, minus everything secret.
 *  No hash, no salt, no full card number: 07_portal.sql asserts their absence. */
export interface PortalAccount {
  id: string;
  school_id: string;
  guardian_id: string;
  card_masked: string;
  must_change_pin: boolean;
  /** 0017: per-school. False means the barcode alone signs in. */
  pin_required: boolean;
  locale: PortalLocale;
  locked_until: string | null;
  last_login_at: string | null;
  issued_at: string;
  school_name: string;
  /** From school_settings key 'gcash_number'. Null until an admin sets it. */
  gcash_number: string | null;
  guardian_name: string;
}

/** pta.v_portal_children — the signed-in guardian's own children. */
export interface PortalChild {
  guardian_id: string;
  school_id: string;
  student_id: string;
  full_name: string;
  student_no: string | null;
  grade_level: string | null;
  section_name: string | null;
  relationship: string;
  is_primary: boolean;
  notify: boolean;
  school_year_id: string | null;
  school_year_name: string | null;
  /** False for a child who has graduated, transferred or dropped. A claim for
   *  them cannot be approved, because pta.payments has an FK to enrollments. */
  is_enrolled: boolean;
  outstanding_balance: number;
  has_gate_card: boolean;
}

/** pta.v_portal_attendance — gate scans, already windowed by the view:
 *  the whole school year for a primary guardian, 7 days for anyone else. */
export interface PortalScan {
  guardian_id: string;
  event_id: string;
  school_id: string;
  student_id: string;
  full_name: string;
  student_no: string | null;
  grade_level: string | null;
  section_name: string | null;
  scanned_at: string;
  /** Computed in SQL, in Asia/Manila (D11). Never bucket scanned_at here. */
  local_date: string;
  direction: ScanDirection;
  queued: boolean;
  clock_synced: boolean;
  /** Null for a non-primary guardian: times, but no pictures. */
  image_path: string | null;
}

/** pta.v_portal_balances — one row per unsettled charge. */
export interface PortalBalance {
  guardian_id: string;
  charge_id: string;
  school_id: string;
  student_id: string;
  school_year_id: string;
  fee_type_name: string;
  fee_category: FeeCategory;
  description: string | null;
  amount: number;
  waived_amount: number;
  paid: number;
  balance: number;
  due_date: string | null;
  payment_status: DerivedPaymentStatus;
  student_name: string;
}

/** pta.v_portal_payments — receipts the parent can quote at the office. */
export interface PortalPayment {
  guardian_id: string;
  payment_id: string;
  school_id: string;
  student_id: string;
  receipt_number: string;
  payment_date: string;
  total_amount: number;
  payment_method: PaymentMethod;
  reference_number: string | null;
  status: PaymentStatus;
  student_name: string;
}

/** pta.v_portal_claims — the parent's own submissions and where they stand. */
export interface PortalClaim {
  id: string;
  guardian_id: string;
  school_id: string;
  claim_type: ClaimType;
  student_id: string | null;
  program_id: string | null;
  claimed_amount: number;
  payment_method: ClaimMethod;
  reference_number: string;
  proof_path: string | null;
  status: ClaimStatus;
  review_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
  payment_id: string | null;
  donation_id: string | null;
  receipt_number: string | null;
  acknowledgement_number: string | null;
  student_name: string | null;
  program_name: string | null;
}

/** pta.v_portal_programs — open programs in the current school year. */
export interface PortalProgram {
  id: string;
  school_id: string;
  school_year_id: string;
  name: string;
  description: string | null;
  category: string;
  target_amount: number | null;
  accepts_pledges: boolean;
  accepts_in_kind: boolean;
  starts_on: string | null;
  ends_on: string | null;
  raised_cash: number;
}

/** pta.v_portal_pledges — fulfilment DERIVED, never stored (D15). */
export interface PortalPledge {
  id: string;
  school_id: string;
  program_id: string;
  program_name: string;
  pledged_amount: number;
  fulfilled_amount: number;
  remaining_amount: number;
  fulfilment_status: "open" | "partially_fulfilled" | "fulfilled" | "cancelled";
  due_date: string | null;
  status: "open" | "cancelled";
  created_at: string;
  guardian_id: string;
}

/** pta.v_portal_telegram — everything the guide page needs to be truthful. */
export interface PortalTelegramStatus {
  guardian_id: string;
  school_id: string;
  is_linked: boolean;
  telegram_active: boolean;
  telegram_linked_at: string | null;
  notifying_children: number;
  total_children: number;
  /** From school_settings key 'telegram_bot'. Null until an admin sets it —
   *  without it there is no deep link to build. */
  bot_username: string | null;
}

/** pta.v_payment_claims_detail — the staff review queue. */
export interface PaymentClaimDetail extends PortalClaim {
  school_year_id: string;
  items: { charge_id: string; amount: number }[] | null;
  is_anonymous: boolean;
  remarks: string | null;
  reviewed_by: string | null;
  updated_at: string;
  guardian_name: string;
  guardian_contact: string | null;
  student_no: string | null;
  grade_level: string | null;
  section_name: string | null;
  /** Surfaced so a reviewer is not the one who discovers, at approval time,
   *  that create_payment() is about to fail on the enrollment FK. */
  student_is_enrolled: boolean;
}

/** pta.v_parent_cards_detail — issued cards. The NUMBER is deliberately absent:
 *  issuance returns it once, to the person issuing, and never again. */
export interface ParentCardDetail {
  id: string;
  school_id: string;
  guardian_id: string;
  card_masked: string;
  status: PortalAccountStatus;
  must_change_pin: boolean;
  locked_until: string | null;
  last_login_at: string | null;
  issued_at: string;
  revoked_at: string | null;
  locale: PortalLocale;
  guardian_name: string;
  contact_number: string | null;
  telegram_linked: boolean;
  children: number;
}

/** pta.v_parent_cards_pending — guardians with children but no card yet. */
export interface ParentCardPending {
  guardian_id: string;
  school_id: string;
  guardian_name: string;
  contact_number: string | null;
  children: number;
}

/**
 * pta.parent_card_roster() — the printing press list (0022).
 *
 * The one place in this project that carries a card number in the clear. It
 * reaches TypeScript only inside a super admin's request for the print page,
 * is never stored, and never goes near a list screen.
 */
export interface ParentCardRosterRow {
  account_id: string;
  guardian_id: string;
  guardian_name: string;
  contact_number: string | null;
  children: number;
  card_number: string;
  issued_at: string;
}

/** Minimal shape the Supabase client needs; RPC args/returns are typed at call sites. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
