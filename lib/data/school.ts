import { createClient } from "@/lib/supabase/server";
import type { SchoolYear, Section, FeeType, GradeLevel } from "@/types/database.types";

/** The active school year, or the most recent one if none is marked active. */
export async function getActiveSchoolYear(
  schoolId: string,
): Promise<SchoolYear | null> {
  const supabase = await createClient();

  const { data: active } = await supabase
    .from("school_years")
    .select("*")
    .eq("school_id", schoolId)
    .eq("is_active", true)
    .maybeSingle<SchoolYear>();

  if (active) return active;

  const { data: latest } = await supabase
    .from("school_years")
    .select("*")
    .eq("school_id", schoolId)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle<SchoolYear>();

  return latest ?? null;
}

export async function getSchoolYears(schoolId: string): Promise<SchoolYear[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("school_years")
    .select("*")
    .eq("school_id", schoolId)
    .order("start_date", { ascending: false });
  return (data ?? []) as SchoolYear[];
}

/** Resolve the school year for a page: the requested one, else the active one. */
export async function resolveSchoolYear(
  schoolId: string,
  requestedId?: string,
): Promise<SchoolYear | null> {
  if (requestedId) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("school_years")
      .select("*")
      .eq("school_id", schoolId)
      .eq("id", requestedId)
      .maybeSingle<SchoolYear>();
    if (data) return data;
  }
  return getActiveSchoolYear(schoolId);
}

export async function getSections(
  schoolId: string,
  schoolYearId: string,
): Promise<Section[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sections")
    .select("*")
    .eq("school_id", schoolId)
    .eq("school_year_id", schoolYearId)
    .order("grade_level")
    .order("name");
  return (data ?? []) as Section[];
}

export async function getFeeTypes(
  schoolId: string,
  onlyActive = true,
): Promise<FeeType[]> {
  const supabase = await createClient();
  let q = supabase.from("fee_types").select("*").eq("school_id", schoolId);
  if (onlyActive) q = q.eq("active", true);
  const { data } = await q.order("category").order("name");
  return (data ?? []) as FeeType[];
}

export async function getGradeLevels(): Promise<GradeLevel[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("grade_levels")
    .select("*")
    .order("sort_order");
  return (data ?? []) as GradeLevel[];
}

export interface SchoolTeacher {
  profile_id: string;
  full_name: string;
  email: string;
}

/** Active teacher accounts in the school (0030), for assigning to sections. */
export async function getSchoolTeachers(schoolId: string): Promise<SchoolTeacher[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("school_users")
    .select("profile_id, profile:profiles(full_name, email)")
    .eq("school_id", schoolId)
    .eq("role", "teacher")
    .eq("status", "active");
  return ((data ?? []) as unknown as {
    profile_id: string;
    profile: { full_name: string; email: string } | null;
  }[])
    .map((r) => ({
      profile_id: r.profile_id,
      full_name: r.profile?.full_name ?? r.profile?.email ?? "Teacher",
      email: r.profile?.email ?? "",
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

/** Teacher profile ids per section, for the given sections. */
export async function getSectionTeacherIds(
  schoolId: string,
  sectionIds: string[],
): Promise<Record<string, string[]>> {
  if (sectionIds.length === 0) return {};
  const supabase = await createClient();
  const { data } = await supabase
    .from("section_teachers")
    .select("section_id, profile_id")
    .eq("school_id", schoolId)
    .in("section_id", sectionIds);
  const out: Record<string, string[]> = {};
  for (const r of (data ?? []) as { section_id: string; profile_id: string }[]) {
    (out[r.section_id] ??= []).push(r.profile_id);
  }
  return out;
}
