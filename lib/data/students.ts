import { createClient } from "@/lib/supabase/server";
import type {
  ChargeBalance,
  Guardian,
  Payment,
  Section,
  Student,
  StudentEnrollment,
} from "@/types/database.types";

export interface StudentSearchResult {
  student_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  student_status: string;
  grade_level: string;
  section_name: string | null;
  student_number: string | null;
  outstanding: number;
  primary_guardian_name: string | null;
}

/**
 * Cashier-facing student search.
 *
 * Runs entirely server-side against indexed columns and returns a page of
 * results — never the whole student body for the browser to filter (v1 §17).
 */
export async function searchStudents(opts: {
  schoolId: string;
  schoolYearId: string;
  query?: string;
  gradeLevel?: string;
  sectionId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: StudentSearchResult[]; total: number }> {
  const supabase = await createClient();
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 25;
  const from = (page - 1) * pageSize;

  let q = supabase
    .from("v_student_payment_status")
    .select("*", { count: "exact" })
    .eq("school_id", opts.schoolId)
    .eq("school_year_id", opts.schoolYearId);

  if (opts.gradeLevel) q = q.eq("grade_level", opts.gradeLevel);
  if (opts.status) q = q.eq("student_status", opts.status);

  const term = opts.query?.trim();
  if (term) {
    // Guardian and receipt search need their own lookups; this covers the
    // student-side fields, which is the overwhelming majority of searches.
    const escaped = term.replace(/[%,()]/g, " ");
    q = q.or(
      [
        `first_name.ilike.%${escaped}%`,
        `last_name.ilike.%${escaped}%`,
        `middle_name.ilike.%${escaped}%`,
        `student_number.ilike.%${escaped}%`,
      ].join(","),
    );
  }

  const { data, count } = await q
    .order("last_name")
    .order("first_name")
    .range(from, from + pageSize - 1);

  const rows = (data ?? []).map((r: Record<string, unknown>) => ({
    student_id: r.student_id as string,
    first_name: r.first_name as string,
    middle_name: r.middle_name as string | null,
    last_name: r.last_name as string,
    suffix: r.suffix as string | null,
    student_status: r.student_status as string,
    grade_level: r.grade_level as string,
    section_name: r.section_name as string | null,
    student_number: r.student_number as string | null,
    outstanding: Number(r.outstanding ?? 0),
    primary_guardian_name: null,
  }));

  return { rows, total: count ?? 0 };
}

/** Search by LRN or guardian name — the slower paths, used when the fast one misses. */
export async function searchStudentsWide(opts: {
  schoolId: string;
  query: string;
  limit?: number;
}): Promise<string[]> {
  const supabase = await createClient();
  const term = opts.query.trim();
  if (!term) return [];

  const [byLrn, byGuardian] = await Promise.all([
    supabase
      .from("students")
      .select("id")
      .eq("school_id", opts.schoolId)
      .ilike("lrn", `%${term}%`)
      .limit(opts.limit ?? 25),
    supabase
      .from("student_guardians")
      .select("student_id, guardian:parents_guardians!inner(first_name,last_name)")
      .eq("school_id", opts.schoolId)
      .or(
        `first_name.ilike.%${term}%,last_name.ilike.%${term}%`,
        { referencedTable: "parents_guardians" },
      )
      .limit(opts.limit ?? 25),
  ]);

  const ids = new Set<string>();
  (byLrn.data ?? []).forEach((r: { id: string }) => ids.add(r.id));
  (byGuardian.data ?? []).forEach((r: { student_id: string }) =>
    ids.add(r.student_id),
  );
  return [...ids];
}

export interface StudentProfileData {
  student: Student;
  enrollment: (StudentEnrollment & { section: Section | null }) | null;
  guardians: (Guardian & { relationship: string; is_primary: boolean })[];
  charges: ChargeBalance[];
  payments: (Payment & { collector: { full_name: string } | null })[];
  totals: {
    charged: number;
    waived: number;
    paid: number;
    outstanding: number;
    transactions: number;
  };
}

export async function getStudentProfile(
  studentId: string,
  schoolId: string,
  schoolYearId: string,
): Promise<StudentProfileData | null> {
  const supabase = await createClient();

  const { data: student } = await supabase
    .from("students")
    .select("*")
    .eq("id", studentId)
    .eq("school_id", schoolId)
    .maybeSingle<Student>();

  if (!student) return null;

  const [enrollmentRes, guardiansRes, chargesRes, paymentsRes] = await Promise.all([
    supabase
      .from("student_enrollments")
      .select("*, section:sections(*)")
      .eq("student_id", studentId)
      .eq("school_year_id", schoolYearId)
      .maybeSingle(),
    supabase
      .from("student_guardians")
      .select("relationship, is_primary, guardian:parents_guardians(*)")
      .eq("student_id", studentId)
      .order("is_primary", { ascending: false }),
    supabase
      .from("v_student_charge_balances")
      .select("*")
      .eq("student_id", studentId)
      .eq("school_year_id", schoolYearId)
      .order("due_date", { nullsFirst: false })
      .order("created_at"),
    supabase
      .from("payments")
      .select("*, collector:profiles!payments_collected_by_fkey(full_name)")
      .eq("student_id", studentId)
      .eq("school_year_id", schoolYearId)
      .order("payment_date", { ascending: false }),
  ]);

  const charges = (chargesRes.data ?? []) as ChargeBalance[];
  const payments = (paymentsRes.data ?? []) as StudentProfileData["payments"];

  const active = charges.filter((c) => c.status !== "cancelled");
  const totals = {
    charged: active.reduce((s, c) => s + Number(c.amount), 0),
    waived: active.reduce((s, c) => s + Number(c.waived_amount), 0),
    paid: active.reduce((s, c) => s + Number(c.paid), 0),
    outstanding: active
      .filter((c) => c.status === "active")
      .reduce((s, c) => s + Number(c.balance), 0),
    transactions: payments.filter((p) => p.status === "posted").length,
  };

  const guardians = ((guardiansRes.data ?? []) as unknown as {
    relationship: string;
    is_primary: boolean;
    guardian: Guardian;
  }[]).map((g) => ({
    ...g.guardian,
    relationship: g.relationship,
    is_primary: g.is_primary,
  }));

  return {
    student,
    enrollment: (enrollmentRes.data ?? null) as StudentProfileData["enrollment"],
    guardians,
    charges,
    payments,
    totals,
  };
}
