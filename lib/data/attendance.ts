import { createClient } from "@/lib/supabase/server";
import type {
  AttendanceDay,
  AttendanceScan,
  AttendanceStudent,
} from "@/types/database.types";

/**
 * Attendance reads for the staff side.
 *
 * The two summaries are RPCs (0024) rather than table reads because PostgREST
 * cannot GROUP BY, and a month of a large school is a hundred thousand scans.
 * Both are SECURITY INVOKER, so they come back RLS-scoped exactly like a
 * `.from()` would — there is no elevated client anywhere in this file.
 *
 * Everything a day means is decided in SQL (D11). Nothing here parses a
 * timestamp to work out which day it belongs to.
 *
 * The vocabulary, which the pages repeat rather than soften:
 *   present   a card that resolves to this student passed a reader that day
 *   absent    a student who holds a card and did not
 *   unseen    a student who holds no card, and so cannot appear either way
 */

/**
 * A missing function is a deployment problem, not an empty report.
 *
 * Migrations here are applied by hand in the SQL Editor, so the realistic
 * failure is 0024 not having been run against this project yet. PostgREST
 * answers that with PGRST202 and supabase-js hands back `data: null` — which
 * every caller below would render as a school where nobody has ever tapped a
 * card. Same reasoning as getPortalAccount(): name the actual problem.
 */
function assertDeployed(
  error: { code?: string; message?: string } | null,
  fn: string,
) {
  if (!error) return;
  if (error.code === "PGRST202" || /could not find the function/i.test(error.message ?? "")) {
    throw new Error(
      `pta.${fn}() does not exist on this project. Apply ` +
        "supabase/migrations/0024_attendance_reports.sql in the Supabase SQL " +
        `Editor. Underlying error: ${error.message}`,
    );
  }
}

/** A school year's window, clamped to an explicit from/to when one is given. */
export function attendanceWindow(
  year: { start_date: string; end_date: string },
  from?: string | null,
  to?: string | null,
  today?: string,
): { from: string; to: string } {
  const start = from && from > year.start_date ? from : year.start_date;
  // The year runs to March; asking the gate about next February returns
  // nothing and reads as a broken page, so a live year stops at today.
  const yearEnd =
    today && today < year.end_date && today > year.start_date
      ? today
      : year.end_date;
  const end = to && to < yearEnd ? to : yearEnd;
  return { from: start, to: end < start ? start : end };
}

export async function getAttendanceDays(
  schoolId: string,
  from: string,
  to: string,
): Promise<AttendanceDay[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("attendance_day_summary", {
    p_school_id: schoolId,
    p_from: from,
    p_to: to,
  });
  assertDeployed(error, "attendance_day_summary");

  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    local_date: r.local_date as string,
    students_present: Number(r.students_present ?? 0),
    scans: Number(r.scans ?? 0),
    unknown_scans: Number(r.unknown_scans ?? 0),
    first_scan_at: r.first_scan_at as string,
    last_scan_at: r.last_scan_at as string,
  }));
}

export async function getAttendanceStudents(
  schoolId: string,
  schoolYearId: string,
  from: string,
  to: string,
): Promise<AttendanceStudent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("attendance_student_summary", {
    p_school_id: schoolId,
    p_school_year_id: schoolYearId,
    p_from: from,
    p_to: to,
  });
  assertDeployed(error, "attendance_student_summary");

  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    student_id: r.student_id as string,
    full_name: r.full_name as string,
    student_no: (r.student_no as string | null) ?? null,
    grade_level: (r.grade_level as string | null) ?? null,
    section_name: (r.section_name as string | null) ?? null,
    student_status: r.student_status as AttendanceStudent["student_status"],
    has_card: Boolean(r.has_card),
    days_present: Number(r.days_present ?? 0),
    scans: Number(r.scans ?? 0),
    first_seen: (r.first_seen as string | null) ?? null,
    last_seen: (r.last_seen as string | null) ?? null,
    last_scan_at: (r.last_scan_at as string | null) ?? null,
  }));
}

export interface GradeAttendance {
  grade_level: string;
  enrolled: number;
  carded: number;
  seen: number;
  /** Student-days actually recorded across the window. */
  present_days: number;
  /** Of the students who COULD be seen, the share of their possible days that
   *  were. Null when nobody in the grade holds a card — a rate computed over a
   *  denominator of zero is not 0%, it is nothing. */
  rate: number | null;
}

/**
 * Per-grade rollup.
 *
 * Done here rather than in SQL because the input is one row per student, not
 * one per scan — a few thousand rows at the very most, already fetched for the
 * table below it. A second RPC would re-read the same scans to re-derive the
 * same numbers.
 *
 * The denominator is CARDED students, not enrolled ones. Dividing by everybody
 * would report a school that has only issued half its cards as running at 50%
 * attendance, which is the single most misleading number this page could show.
 */
export function rollUpByGrade(
  students: AttendanceStudent[],
  schoolDays: number,
): GradeAttendance[] {
  const byGrade = new Map<string, GradeAttendance>();

  for (const s of students) {
    const key = s.grade_level ?? "—";
    const row =
      byGrade.get(key) ??
      ({
        grade_level: key,
        enrolled: 0,
        carded: 0,
        seen: 0,
        present_days: 0,
        rate: null,
      } satisfies GradeAttendance);

    row.enrolled += 1;
    if (s.has_card) row.carded += 1;
    if (s.days_present > 0) row.seen += 1;
    row.present_days += s.days_present;
    byGrade.set(key, row);
  }

  for (const row of byGrade.values()) {
    const possible = row.carded * schoolDays;
    row.rate = possible > 0 ? (row.present_days / possible) * 100 : null;
  }

  return [...byGrade.values()].sort((a, b) =>
    a.grade_level.localeCompare(b.grade_level, undefined, { numeric: true }),
  );
}

/**
 * One student's scans over a window, newest first.
 *
 * A single student's year is a few hundred rows, so this reads the view
 * directly instead of going through a summary — the Attendance tab wants the
 * individual taps, not a count of them.
 */
export async function getStudentScans(
  schoolId: string,
  studentId: string,
  from: string,
  to: string,
  limit = 500,
): Promise<AttendanceScan[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_attendance_local")
    .select("*")
    .eq("school_id", schoolId)
    .eq("student_id", studentId)
    .gte("local_date", from)
    .lte("local_date", to)
    .order("scanned_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as AttendanceScan[];
}

/**
 * Group scans into days, newest day first.
 *
 * Keyed on `local_date`, which SQL computed in the school's timezone. Grouping
 * on `scanned_at` here would split every morning at 08:00 Manila (D11).
 */
export function groupScansByDay(
  scans: AttendanceScan[],
): [string, AttendanceScan[]][] {
  const days = new Map<string, AttendanceScan[]>();
  for (const scan of scans) {
    const list = days.get(scan.local_date) ?? [];
    list.push(scan);
    days.set(scan.local_date, list);
  }
  return [...days.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

/**
 * The student's live gate card, if they hold one.
 *
 * The Attendance tab needs this to say which of two things an empty list is:
 * a student who did not come to school, or a student the reader has no way of
 * recognising. Reported, never inferred from the absence of scans.
 */
export async function getLiveStudentCard(
  schoolId: string,
  studentId: string,
): Promise<{ card_uid: string; issued_at: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("student_cards")
    .select("card_uid, issued_at")
    .eq("school_id", schoolId)
    .eq("student_id", studentId)
    .is("revoked_at", null)
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as { card_uid: string; issued_at: string } | null) ?? null;
}
