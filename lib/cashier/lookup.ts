import { createClient } from "@/lib/supabase/browser";
import { buildAllocationLines } from "@/lib/financial/allocation";
import { formatNameFull } from "@/lib/utils/names";
import type { ChargeBalance } from "@/types/database.types";
import type { CollectLine } from "./settlement";

/**
 * Everything the desk reads, through the RLS-bound browser client like the
 * payment search it replaces for this role. The server never holds a parent's
 * screen state, and a scan is one round trip away from a balance.
 */

interface NameRow {
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
}

export interface HouseholdStudent {
  id: string;
  name: string;
  /** Null when the student has no enrollment in the active year. */
  gradeLevel: string | null;
  sectionName: string | null;
  studentNumber: string | null;
}

export interface Household {
  /** Who is standing at the counter, as far as the lookup knows. */
  kind: "parent" | "student";
  name: string;
  contact: string | null;
  /** Linked guardians, when the lookup started from a student. */
  guardians: string[];
  students: HouseholdStudent[];
  lines: CollectLine[];
}

export interface ParentHit {
  kind: "parent";
  id: string;
  name: string;
  contact: string | null;
  children: string[];
}

export interface StudentHit {
  kind: "student";
  id: string;
  name: string;
  detail: string;
}

export type PayerHit = ParentHit | StudentHit;

/** Throw on a failed read, so "the network is down" never reads as "no such card". */
function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

/**
 * Words become ANDed filters, so "juan dela cruz" finds a first name and a last
 * name that no single column contains. Characters that mean something to
 * PostgREST's filter grammar are dropped.
 */
function searchWords(term: string): string[] {
  return term
    .replace(/[%,()"\\*:]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);
}

function ilikeAny(columns: string[], word: string): string {
  return columns.map((column) => `${column}.ilike.%${word}%`).join(",");
}

/**
 * Parents first, because that is who is paying, then students: a child with no
 * linked guardian must still be payable, and a parent often gives the child's
 * name rather than their own.
 */
export async function searchPayers(
  schoolId: string,
  schoolYearId: string,
  term: string,
): Promise<PayerHit[]> {
  const supabase = createClient();
  const words = searchWords(term);
  if (words.length === 0) return [];

  // !inner drops guardian rows with no child: those are donors (0014), and they
  // have nothing to pay here.
  let parents = supabase
    .from("parents_guardians")
    .select(
      "id,first_name,middle_name,last_name,suffix,contact_number," +
        "links:student_guardians!inner(student:students(first_name,last_name))",
    )
    .eq("school_id", schoolId);

  let students = supabase
    .from("v_student_payment_status")
    .select(
      "student_id,first_name,middle_name,last_name,suffix,grade_level,section_name,student_number",
    )
    .eq("school_id", schoolId)
    .eq("school_year_id", schoolYearId);

  for (const word of words) {
    parents = parents.or(
      ilikeAny(["first_name", "last_name", "contact_number"], word),
    );
    students = students.or(
      ilikeAny(["first_name", "last_name", "student_number"], word),
    );
  }

  const [parentResult, studentResult] = await Promise.all([
    parents.order("last_name").order("first_name").limit(8),
    students.order("last_name").order("first_name").limit(8),
  ]);

  const parentRows = check(parentResult) as unknown as (NameRow & {
    id: string;
    contact_number: string | null;
    links: { student: { first_name: string; last_name: string } | null }[];
  })[];

  const studentRows = check(studentResult) as unknown as (NameRow & {
    student_id: string;
    grade_level: string | null;
    section_name: string | null;
    student_number: string | null;
  })[];

  return [
    ...parentRows.map(
      (p): ParentHit => ({
        kind: "parent",
        id: p.id,
        name: formatNameFull(p),
        contact: p.contact_number,
        children: p.links.flatMap((l) =>
          l.student ? [`${l.student.first_name} ${l.student.last_name}`] : [],
        ),
      }),
    ),
    ...studentRows.map(
      (s): StudentHit => ({
        kind: "student",
        id: s.student_id,
        name: formatNameFull(s),
        detail: [s.grade_level, s.section_name, s.student_number]
          .filter(Boolean)
          .join(" · "),
      }),
    ),
  ];
}

/**
 * Resolve a scanned card to a guardian in THIS school.
 *
 * lookup_parent_card() is scoped to any school the caller staffs, so a cashier
 * working two schools could otherwise pull up the other school's parent while
 * the desk is recording against this one. The guardian read that follows
 * filters on school_id and comes back empty for that case.
 */
export async function findGuardianByCard(card: string): Promise<string | null> {
  const supabase = createClient();
  const rows = check(
    await supabase.rpc("lookup_parent_card", { p_card_number: card }),
  ) as { guardian_id: string }[] | null;
  return rows?.[0]?.guardian_id ?? null;
}

export async function loadGuardianHousehold(
  schoolId: string,
  schoolYearId: string,
  guardianId: string,
): Promise<Household | null> {
  const supabase = createClient();

  const [guardianResult, linkResult] = await Promise.all([
    supabase
      .from("parents_guardians")
      .select("first_name,middle_name,last_name,suffix,contact_number")
      .eq("school_id", schoolId)
      .eq("id", guardianId)
      .maybeSingle(),
    supabase
      .from("student_guardians")
      .select("student_id")
      .eq("school_id", schoolId)
      .eq("guardian_id", guardianId),
  ]);

  const guardian = check(guardianResult) as
    | (NameRow & { contact_number: string | null })
    | null;
  if (!guardian) return null;

  const links = check(linkResult) as { student_id: string }[];
  const { students, lines } = await loadBalances(
    schoolId,
    schoolYearId,
    links.map((l) => l.student_id),
  );

  return {
    kind: "parent",
    name: formatNameFull(guardian),
    contact: guardian.contact_number,
    guardians: [],
    students,
    lines,
  };
}

export async function loadStudentHousehold(
  schoolId: string,
  schoolYearId: string,
  studentId: string,
): Promise<Household | null> {
  const supabase = createClient();

  const linkRows = check(
    await supabase
      .from("student_guardians")
      .select(
        "is_primary,guardian:parents_guardians(first_name,middle_name,last_name,suffix,contact_number)",
      )
      .eq("school_id", schoolId)
      .eq("student_id", studentId)
      .order("is_primary", { ascending: false }),
  ) as unknown as {
    guardian: (NameRow & { contact_number: string | null }) | null;
  }[];

  const { students, lines } = await loadBalances(schoolId, schoolYearId, [
    studentId,
  ]);
  if (students.length === 0) return null;

  const guardians = linkRows.flatMap((l) => (l.guardian ? [l.guardian] : []));

  return {
    kind: "student",
    name: students[0].name,
    contact: guardians[0]?.contact_number ?? null,
    guardians: guardians.map((g) => formatNameFull(g)),
    students,
    lines,
  };
}

/**
 * Students and every open charge they owe, across ALL school years.
 *
 * The balance a parent is told has to be the lines they can pay. A graduate
 * keeps their dues (D25), and one student can owe two years, so filtering to the
 * active year here would make a family's total disagree with their card lookup
 * and leave an old debt with no way to be collected at the counter.
 */
async function loadBalances(
  schoolId: string,
  schoolYearId: string,
  studentIds: string[],
): Promise<{ students: HouseholdStudent[]; lines: CollectLine[] }> {
  if (studentIds.length === 0) return { students: [], lines: [] };

  const supabase = createClient();

  const [studentResult, enrollmentResult, chargeResult, yearResult] =
    await Promise.all([
      supabase
        .from("students")
        .select("id,first_name,middle_name,last_name,suffix")
        .eq("school_id", schoolId)
        .in("id", studentIds)
        .order("last_name")
        .order("first_name"),
      supabase
        .from("student_enrollments")
        .select("student_id,grade_level,student_number,section:sections(name)")
        .eq("school_id", schoolId)
        .eq("school_year_id", schoolYearId)
        .in("student_id", studentIds),
      supabase
        .from("v_student_charge_balances")
        .select("*")
        .eq("school_id", schoolId)
        .in("student_id", studentIds)
        .eq("status", "active")
        .gt("balance", 0),
      supabase.from("school_years").select("id,name").eq("school_id", schoolId),
    ]);

  const studentRows = check(studentResult) as (NameRow & { id: string })[];
  const enrollments = check(enrollmentResult) as unknown as {
    student_id: string;
    grade_level: string | null;
    student_number: string | null;
    section: { name: string } | null;
  }[];
  const charges = (check(chargeResult) as ChargeBalance[]).map((c) => ({
    ...c,
    balance: Number(c.balance),
  }));
  const years = new Map(
    (check(yearResult) as { id: string; name: string }[]).map((y) => [
      y.id,
      y.name,
    ]),
  );

  const yearOfCharge = new Map(charges.map((c) => [c.id, c.school_year_id]));

  const students = studentRows.map((s): HouseholdStudent => {
    const enrollment = enrollments.find((e) => e.student_id === s.id);
    return {
      id: s.id,
      name: formatNameFull(s),
      gradeLevel: enrollment?.grade_level ?? null,
      sectionName: enrollment?.section?.name ?? null,
      studentNumber: enrollment?.student_number ?? null,
    };
  });

  const lines = students.flatMap((student) =>
    buildAllocationLines(charges.filter((c) => c.student_id === student.id)).map(
      (line): CollectLine => {
        const yearId = yearOfCharge.get(line.chargeId)!;
        return {
          ...line,
          studentId: student.id,
          schoolYearId: yearId,
          schoolYearName: years.get(yearId) ?? "",
          priorYear: yearId !== schoolYearId,
        };
      },
    ),
  );

  return { students, lines };
}
