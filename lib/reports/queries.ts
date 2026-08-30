import { createClient } from "@/lib/supabase/server";
import {
  lookupNames,
  lookupPaymentFeeNames,
  paymentIdsForFeeType,
} from "@/lib/data/hydrate";
import { lookupDonationNames } from "@/lib/data/donations";

export interface ReportFilters {
  schoolId: string;
  schoolYearId: string;
  from?: string | null;
  to?: string | null;
  feeTypeId?: string | null;
  cashierId?: string | null;
  paymentMethod?: string | null;
}

export interface CollectionRow {
  id: string;
  receipt_number: string;
  collection_date: string;
  payment_date: string;
  student_name: string;
  grade_level: string | null;
  fee_names: string;
  total_amount: number;
  payment_method: string;
  cashier_name: string;
}

/**
 * Collection report.
 *
 * Date filtering uses collection_date from v_payments_local, which SQL computed
 * in the school's timezone (D11). Filtering on payment_date directly would slice
 * the day at UTC midnight — 08:00 Manila — and split every morning in two.
 */
export async function getCollectionReport(
  f: ReportFilters,
): Promise<CollectionRow[]> {
  const supabase = await createClient();

  let q = supabase
    .from("v_payments_local")
    .select(
      "id,receipt_number,collection_date,payment_date,total_amount," +
        "payment_method,student_id,collected_by",
    )
    .eq("school_id", f.schoolId)
    .eq("school_year_id", f.schoolYearId)
    .eq("status", "posted");

  if (f.from) q = q.gte("collection_date", f.from);
  if (f.to) q = q.lte("collection_date", f.to);
  if (f.cashierId) q = q.eq("collected_by", f.cashierId);
  if (f.paymentMethod) q = q.eq("payment_method", f.paymentMethod);

  const { data } = await q.order("payment_date", { ascending: false }).limit(5000);

  type Raw = {
    id: string;
    receipt_number: string;
    collection_date: string;
    payment_date: string;
    total_amount: number;
    payment_method: string;
    student_id: string;
    collected_by: string;
  };

  let rows = (data ?? []) as unknown as Raw[];

  // A payment can span several fee types, so the filter keeps a receipt when
  // ANY of its lines matches rather than trying to express it in the main query.
  if (f.feeTypeId) {
    const matching = await paymentIdsForFeeType(
      rows.map((r) => r.id),
      f.feeTypeId,
    );
    rows = rows.filter((r) => matching.has(r.id));
  }

  const [names, feeNames] = await Promise.all([
    lookupNames(
      rows.map((r) => r.student_id),
      rows.map((r) => r.collected_by),
    ),
    lookupPaymentFeeNames(rows.map((r) => r.id)),
  ]);

  return rows.map((r) => {
    const student = names.students.get(r.student_id);
    return {
      id: r.id,
      receipt_number: r.receipt_number,
      collection_date: r.collection_date,
      payment_date: r.payment_date,
      student_name: student
        ? `${student.last_name}, ${student.first_name}`
        : "\u2014",
      grade_level: null,
      fee_names: (feeNames.get(r.id) ?? []).join(", "),
      total_amount: Number(r.total_amount),
      payment_method: r.payment_method,
      cashier_name: names.profiles.get(r.collected_by) ?? "\u2014",
    };
  });
}

export interface FeeTypeTotal {
  fee_type_id: string;
  fee_type_name: string;
  fee_category: string;
  total: number;
  receipt_count: number;
}

export async function getFeeTypeReport(f: ReportFilters): Promise<FeeTypeTotal[]> {
  const supabase = await createClient();

  let q = supabase
    .from("v_collections_by_fee_type")
    .select("fee_type_id,fee_type_name,fee_category,total,receipt_count,collection_date")
    .eq("school_id", f.schoolId)
    .eq("school_year_id", f.schoolYearId);

  if (f.from) q = q.gte("collection_date", f.from);
  if (f.to) q = q.lte("collection_date", f.to);

  const { data } = await q;

  const grouped = new Map<string, FeeTypeTotal>();
  for (const r of (data ?? []) as FeeTypeTotal[]) {
    const existing = grouped.get(r.fee_type_id);
    if (existing) {
      existing.total += Number(r.total);
      existing.receipt_count += Number(r.receipt_count);
    } else {
      grouped.set(r.fee_type_id, {
        fee_type_id: r.fee_type_id,
        fee_type_name: r.fee_type_name,
        fee_category: r.fee_category,
        total: Number(r.total),
        receipt_count: Number(r.receipt_count),
      });
    }
  }
  return [...grouped.values()].sort((a, b) => b.total - a.total);
}

export interface CashierTotal {
  collected_by: string;
  cashier_name: string;
  cash_total: number;
  gcash_total: number;
  bank_total: number;
  other_total: number;
  total: number;
  receipt_count: number;
}

export async function getCashierReport(f: ReportFilters): Promise<CashierTotal[]> {
  const supabase = await createClient();

  let q = supabase
    .from("v_cashier_collections")
    .select("*")
    .eq("school_id", f.schoolId)
    .eq("school_year_id", f.schoolYearId);

  if (f.from) q = q.gte("collection_date", f.from);
  if (f.to) q = q.lte("collection_date", f.to);

  const { data } = await q;

  const grouped = new Map<string, CashierTotal>();
  for (const r of (data ?? []) as CashierTotal[]) {
    const existing = grouped.get(r.collected_by) ?? {
      collected_by: r.collected_by,
      cashier_name: r.cashier_name,
      cash_total: 0,
      gcash_total: 0,
      bank_total: 0,
      other_total: 0,
      total: 0,
      receipt_count: 0,
    };
    existing.cash_total += Number(r.cash_total ?? 0);
    existing.gcash_total += Number(r.gcash_total ?? 0);
    existing.bank_total += Number(r.bank_total ?? 0);
    existing.other_total += Number(r.other_total ?? 0);
    existing.total += Number(r.total ?? 0);
    existing.receipt_count += Number(r.receipt_count ?? 0);
    grouped.set(r.collected_by, existing);
  }
  return [...grouped.values()].sort((a, b) => b.total - a.total);
}

export interface AnnualReport {
  byCategory: { category: string; total: number }[];
  byFeeType: FeeTypeTotal[];
  totalCollections: number;
  studentsEnrolled: number;
  studentsAssessed: number;
  fullyPaid: number;
  partiallyPaid: number;
  unpaid: number;
  totalAssessed: number;
  totalWaived: number;
  totalCollected: number;
  totalOutstanding: number;
}

export async function getAnnualReport(
  schoolId: string,
  schoolYearId: string,
): Promise<AnnualReport> {
  const supabase = await createClient();

  const [feeTypes, statuses] = await Promise.all([
    getFeeTypeReport({ schoolId, schoolYearId }),
    supabase
      .from("v_student_payment_status")
      .select("status,total_charged,total_waived,total_paid,outstanding")
      .eq("school_id", schoolId)
      .eq("school_year_id", schoolYearId),
  ]);

  type S = {
    status: string;
    total_charged: number;
    total_waived: number;
    total_paid: number;
    outstanding: number;
  };
  const rows = (statuses.data ?? []) as S[];

  const byCategory = [...
    feeTypes.reduce((m, f) => {
      m.set(f.fee_category, (m.get(f.fee_category) ?? 0) + f.total);
      return m;
    }, new Map<string, number>()),
  ].map(([category, total]) => ({ category, total }));

  return {
    byCategory,
    byFeeType: feeTypes,
    totalCollections: feeTypes.reduce((s, f) => s + f.total, 0),
    studentsEnrolled: rows.length,
    studentsAssessed: rows.filter((r) => r.status !== "not_assessed").length,
    fullyPaid: rows.filter((r) => r.status === "fully_paid").length,
    partiallyPaid: rows.filter((r) => r.status === "partially_paid").length,
    unpaid: rows.filter((r) => r.status === "unpaid").length,
    totalAssessed: rows.reduce((s, r) => s + Number(r.total_charged), 0),
    totalWaived: rows.reduce((s, r) => s + Number(r.total_waived), 0),
    totalCollected: rows.reduce((s, r) => s + Number(r.total_paid), 0),
    totalOutstanding: rows.reduce((s, r) => s + Number(r.outstanding), 0),
  };
}

/* -------------------------------------------------------------------------- */
/*  Donations                                                                 */
/* -------------------------------------------------------------------------- */

export interface DonationReportRow {
  id: string;
  acknowledgement_number: string;
  collection_date: string;
  donation_date: string;
  donor_id: string | null;
  donor_name: string;
  is_anonymous: boolean;
  program_name: string;
  kind: "cash" | "in_kind";
  amount: number;
  payment_method: string | null;
  item_description: string | null;
  received_by_name: string;
}

/**
 * Donation report.
 *
 * Reads v_donations_local for the same reason the collection report reads
 * v_payments_local: collection_date is the school-local calendar day computed
 * in SQL (D11). Filtering donation_date directly would slice the day at UTC
 * midnight and split every morning's giving in two.
 */
export async function getDonationReport(
  f: ReportFilters & { programId?: string | null; kind?: string | null },
): Promise<DonationReportRow[]> {
  const supabase = await createClient();

  let q = supabase
    .from("v_donations_local")
    .select(
      "id,acknowledgement_number,collection_date,donation_date,donor_id," +
        "program_id,is_anonymous,kind,amount,payment_method,item_description,received_by",
    )
    .eq("school_id", f.schoolId)
    .eq("school_year_id", f.schoolYearId)
    .eq("status", "posted");

  if (f.from) q = q.gte("collection_date", f.from);
  if (f.to) q = q.lte("collection_date", f.to);
  if (f.programId) q = q.eq("program_id", f.programId);
  if (f.kind) q = q.eq("kind", f.kind);
  if (f.paymentMethod) q = q.eq("payment_method", f.paymentMethod);

  const { data } = await q
    .order("donation_date", { ascending: false })
    .limit(5000);

  type Raw = {
    id: string;
    acknowledgement_number: string;
    collection_date: string;
    donation_date: string;
    donor_id: string | null;
    program_id: string;
    is_anonymous: boolean;
    kind: "cash" | "in_kind";
    amount: number;
    payment_method: string | null;
    item_description: string | null;
    received_by: string;
  };

  const rows = (data ?? []) as unknown as Raw[];

  const names = await lookupDonationNames(
    rows.map((r) => r.donor_id),
    rows.map((r) => r.program_id),
    rows.map((r) => r.received_by),
  );

  return rows.map((r) => ({
    id: r.id,
    acknowledgement_number: r.acknowledgement_number,
    collection_date: r.collection_date,
    donation_date: r.donation_date,
    donor_id: r.donor_id,
    donor_name: r.is_anonymous
      ? "Anonymous"
      : (names.donors.get(r.donor_id ?? "")?.display_name ?? "—"),
    is_anonymous: r.is_anonymous,
    program_name: names.programs.get(r.program_id) ?? "—",
    kind: r.kind,
    amount: Number(r.amount),
    payment_method: r.payment_method,
    item_description: r.item_description,
    received_by_name: names.profiles.get(r.received_by) ?? "—",
  }));
}
