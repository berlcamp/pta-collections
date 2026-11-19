import { createClient } from "@/lib/supabase/server";
import type { SchoolSession } from "@/lib/auth/session";
import { getActiveSchoolYear, getSections } from "@/lib/data/school";

/**
 * The teacher workspace's reads (0030). A teacher account reads nothing of the
 * school through RLS, so every one of these is a SECURITY DEFINER function
 * that checks the section is theirs; an admin of the school may call them too.
 */

export interface TeacherSection {
  section_id: string;
  section_name: string;
  grade_level: string;
  school_year_name: string;
  is_active_year: boolean;
  enrolled_count: number;
}

export interface SectionDayRow {
  student_id: string;
  full_name: string;
  student_no: string | null;
  sex: string | null;
  has_card: boolean;
  first_scan_at: string | null;
  last_scan_at: string | null;
  scans: number;
}

export interface SectionSummaryRow {
  student_id: string;
  full_name: string;
  student_no: string | null;
  has_card: boolean;
  days_present: number;
  scans: number;
  last_seen: string | null;
  school_days: number;
}

/**
 * The sections this person may open. A teacher gets their assignments; an
 * admin previewing the screen gets every section of the active school year.
 */
export async function getTeacherSections(session: SchoolSession): Promise<TeacherSection[]> {
  const supabase = await createClient();

  if (session.activeRole === "teacher") {
    const { data, error } = await supabase.rpc("teacher_sections");
    if (error) throw new Error(error.message);
    return ((data ?? []) as TeacherSection[]).map((s) => ({
      ...s,
      enrolled_count: Number(s.enrolled_count),
    }));
  }

  const year = await getActiveSchoolYear(session.activeSchool.id);
  if (!year) return [];
  const sections = await getSections(session.activeSchool.id, year.id);
  return sections.map((s) => ({
    section_id: s.id,
    section_name: s.name,
    grade_level: s.grade_level,
    school_year_name: year.name,
    is_active_year: true,
    enrolled_count: 0,
  }));
}

export async function getSectionDay(sectionId: string, date: string): Promise<SectionDayRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("section_attendance_day", {
    p_section_id: sectionId,
    p_date: date,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as SectionDayRow[]).map((r) => ({ ...r, scans: Number(r.scans) }));
}

export async function getSectionSummary(
  sectionId: string,
  from: string,
  to: string,
): Promise<SectionSummaryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("section_attendance_summary", {
    p_section_id: sectionId,
    p_from: from,
    p_to: to,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as SectionSummaryRow[]).map((r) => ({
    ...r,
    days_present: Number(r.days_present),
    scans: Number(r.scans),
    school_days: Number(r.school_days),
  }));
}

/** The section in the URL if it is one of theirs, else their first. */
export function pickSection(
  sections: TeacherSection[],
  requested: string | undefined,
): TeacherSection | null {
  return sections.find((s) => s.section_id === requested) ?? sections[0] ?? null;
}
