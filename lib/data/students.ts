import { createClient } from "@/lib/supabase/server";
import { formatNameListing } from "@/lib/utils/names";
import type {
  ChargeBalance,
  Guardian,
  Payment,
  Section,
  Student,
  StudentEnrollment,
} from "@/types/database.types";

/** The one guardian a student carries on the roll — the collection contact. */
export interface StudentGuardianSummary {
  guardian_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  contact_number: string | null;
  email: string | null;
  relationship: string;
  is_primary: boolean;
  /** Students in this school linked to the same guardian — i.e. siblings.
   *  Editing the parent touches every one of them. */
  sibling_count: number;
  /** Telegram is bound to this guardian — 0013's `telegram_chat_id is not
   *  null`, the same test v_portal_telegram calls `is_linked`. The chat id
   *  itself stays on the server; only the answer crosses to the browser. */
  telegram_linked: boolean;
  /** Linked AND still being delivered to. 0013 clears this when Telegram
   *  refuses the chat, and portal_set_notify() clears it when the parent turns
   *  notifications off, so linked-but-inactive is a real and silent state. */
  telegram_active: boolean;
}

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
  /** Fields the row's edit dialog needs, which the payment-status view does
   *  not carry. Fetched for the visible page only, never the whole roll. */
  lrn: string | null;
  birth_date: string | null;
  sex: "M" | "F" | null;
  section_id: string | null;
  guardian: StudentGuardianSummary | null;
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
    const escaped = term.replace(/[%,()]/g, " ");
    const clauses = [
      `first_name.ilike.%${escaped}%`,
      `last_name.ilike.%${escaped}%`,
      `middle_name.ilike.%${escaped}%`,
      `student_number.ilike.%${escaped}%`,
    ];

    // A parent's name and an LRN live on other tables, so they cannot join the
    // `or` above directly — they are resolved to student ids first and folded
    // in as one more clause. Capped on both sides, because the fold-in becomes
    // a URL parameter: a term matching every guardian in the school would
    // otherwise build a query string past what PostgREST will accept.
    const wide = (
      await searchStudentsWide({
        schoolId: opts.schoolId,
        query: term,
        limit: WIDE_MATCH_LIMIT,
      })
    ).slice(0, WIDE_MATCH_LIMIT);
    if (wide.length > 0) clauses.push(`student_id.in.(${wide.join(",")})`);

    q = q.or(clauses.join(","));
  }

  const { data, count } = await q
    .order("last_name")
    .order("first_name")
    .range(from, from + pageSize - 1);

  const base = (data ?? []).map((r: Record<string, unknown>) => ({
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
  }));

  const details = await studentRowDetails(
    supabase,
    base.map((r) => r.student_id),
    opts.schoolYearId,
  );

  const rows = base.map((r) => {
    const d = details.get(r.student_id);
    return {
      ...r,
      primary_guardian_name: d?.guardian
        ? formatNameListing(d.guardian)
        : null,
      lrn: d?.lrn ?? null,
      birth_date: d?.birth_date ?? null,
      sex: d?.sex ?? null,
      section_id: d?.section_id ?? null,
      guardian: d?.guardian ?? null,
    };
  });

  return { rows, total: count ?? 0 };
}

/**
 * How many off-view matches (guardian name, LRN) a search may fold in.
 *
 * Each one costs ~37 characters of query string, so this is a URL budget as
 * much as a result cap. Narrowing the term is the answer to hitting it.
 */
const WIDE_MATCH_LIMIT = 100;

interface StudentRowDetail {
  lrn: string | null;
  birth_date: string | null;
  sex: "M" | "F" | null;
  section_id: string | null;
  guardian: StudentGuardianSummary | null;
}

/**
 * The per-row detail the roll shows and its edit dialog seeds from: the parent
 * on file, plus the student and enrollment columns `v_student_payment_status`
 * does not carry.
 *
 * Two queries for the visible page — 50 rows — rather than one per row, and
 * never for the whole school.
 */
async function studentRowDetails(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studentIds: string[],
  schoolYearId: string,
): Promise<Map<string, StudentRowDetail>> {
  const out = new Map<string, StudentRowDetail>();
  if (studentIds.length === 0) return out;

  const [studentsRes, enrollRes] = await Promise.all([
    supabase
      .from("students")
      .select(
        "id, lrn, birth_date, sex, links:student_guardians(relationship, is_primary, guardian:parents_guardians(id, first_name, middle_name, last_name, suffix, contact_number, email, telegram_chat_id, telegram_active))",
      )
      .in("id", studentIds),
    supabase
      .from("student_enrollments")
      .select("student_id, section_id")
      .eq("school_year_id", schoolYearId)
      .in("student_id", studentIds),
  ]);

  const sectionByStudent = new Map<string, string | null>(
    ((enrollRes.data ?? []) as { student_id: string; section_id: string | null }[])
      .map((e) => [e.student_id, e.section_id]),
  );

  type LinkRow = {
    relationship: string;
    is_primary: boolean;
    guardian: {
      id: string;
      first_name: string;
      middle_name: string | null;
      last_name: string;
      suffix: string | null;
      contact_number: string | null;
      email: string | null;
      telegram_chat_id: string | null;
      telegram_active: boolean;
    } | null;
  };

  const studentRows = (studentsRes.data ?? []) as unknown as {
    id: string;
    lrn: string | null;
    birth_date: string | null;
    sex: "M" | "F" | null;
    links: LinkRow[] | null;
  }[];

  // A student carries one guardian, but the table allows more and the embed
  // returns them unordered — the primary is the collection contact.
  const primaryLink = new Map<string, LinkRow | undefined>(
    studentRows.map((row) => [
      row.id,
      [...(row.links ?? [])].sort(
        (a, b) => Number(b.is_primary) - Number(a.is_primary),
      )[0],
    ]),
  );

  // How many students each of those parents has on file, so the row editor can
  // warn that a correction reaches the siblings too. Its own query rather than
  // a third embed level, which is a path nothing else here exercises.
  const guardianIds = [
    ...new Set(
      [...primaryLink.values()]
        .map((l) => l?.guardian?.id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const linkCounts = new Map<string, number>();
  if (guardianIds.length > 0) {
    const { data: allLinks } = await supabase
      .from("student_guardians")
      .select("guardian_id")
      .in("guardian_id", guardianIds);
    for (const l of (allLinks ?? []) as { guardian_id: string }[]) {
      linkCounts.set(l.guardian_id, (linkCounts.get(l.guardian_id) ?? 0) + 1);
    }
  }

  for (const row of studentRows) {
    const link = primaryLink.get(row.id);

    out.set(row.id, {
      lrn: row.lrn,
      birth_date: row.birth_date,
      sex: row.sex,
      section_id: sectionByStudent.get(row.id) ?? null,
      guardian:
        link && link.guardian
          ? {
              guardian_id: link.guardian.id,
              first_name: link.guardian.first_name,
              middle_name: link.guardian.middle_name,
              last_name: link.guardian.last_name,
              suffix: link.guardian.suffix,
              contact_number: link.guardian.contact_number,
              email: link.guardian.email,
              relationship: link.relationship,
              is_primary: link.is_primary,
              sibling_count: Math.max(
                0,
                (linkCounts.get(link.guardian.id) ?? 1) - 1,
              ),
              // The chat id is read here and goes no further: the row that
              // reaches the browser carries the two booleans, not the address
              // of somebody's Telegram.
              telegram_linked: link.guardian.telegram_chat_id !== null,
              telegram_active: link.guardian.telegram_active,
            }
          : null,
    });
  }

  return out;
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
  // The guardian half builds a PostgREST `or` string by hand, where a comma or
  // a paren in the term would be read as syntax rather than as text.
  const escaped = term.replace(/[%,()]/g, " ");

  const [byLrn, byGuardian] = await Promise.all([
    supabase
      .from("students")
      .select("id")
      .eq("school_id", opts.schoolId)
      .ilike("lrn", `%${escaped}%`)
      .limit(opts.limit ?? 25),
    supabase
      .from("student_guardians")
      .select("student_id, guardian:parents_guardians!inner(first_name,last_name)")
      .eq("school_id", opts.schoolId)
      .or(
        `first_name.ilike.%${escaped}%,last_name.ilike.%${escaped}%`,
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
