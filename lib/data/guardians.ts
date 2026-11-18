import { createClient } from "@/lib/supabase/server";

export interface GuardianSearchResult {
  id: string;
  first_name: string;
  last_name: string;
  contact_number: string | null;
  email: string | null;
  /** Students in this school already linked to this guardian — i.e. siblings. */
  student_count: number;
  /** Their names, so the office can confirm it is the right family. */
  children: string[];
}

type GuardianRow = {
  id: string;
  first_name: string;
  last_name: string;
  contact_number: string | null;
  email: string | null;
  links: { student: { first_name: string; last_name: string } | null }[] | null;
};

const GUARDIAN_SELECT =
  "id, first_name, last_name, contact_number, email, links:student_guardians(student:students(first_name, last_name))";

function toResult(g: GuardianRow): GuardianSearchResult {
  const children = (g.links ?? [])
    .map((l) => l.student)
    .filter((s): s is { first_name: string; last_name: string } => Boolean(s))
    .map((s) => `${s.first_name} ${s.last_name}`);
  return {
    id: g.id,
    first_name: g.first_name,
    last_name: g.last_name,
    contact_number: g.contact_number,
    email: g.email,
    student_count: g.links?.length ?? 0,
    children,
  };
}

/**
 * Parents on file with this mobile number — the first thing the new-student
 * form asks, because a number survives "Ma." vs "Maria" and a name does not.
 *
 * Matched on the last ten digits so 0917…, +63917… and 63917… all agree,
 * including records saved before contacts were normalized. Not unique: a
 * husband and wife often share one phone, so every match is shown.
 */
export async function findGuardiansByContact(opts: {
  schoolId: string;
  contact: string;
  limit?: number;
}): Promise<GuardianSearchResult[]> {
  const digits = opts.contact.replace(/\D/g, "");
  if (digits.length < 10) return [];
  const tail = digits.slice(-10);

  const supabase = await createClient();
  const { data } = await supabase
    .from("parents_guardians")
    .select(GUARDIAN_SELECT)
    .eq("school_id", opts.schoolId)
    .ilike("contact_number", `%${tail}%`)
    .order("last_name")
    .limit(opts.limit ?? 5);

  return ((data ?? []) as unknown as GuardianRow[]).map(toResult);
}

/** One guardian by id, in the same shape — for pre-linking a sibling. */
export async function getGuardianSummary(
  schoolId: string,
  guardianId: string,
): Promise<GuardianSearchResult | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("parents_guardians")
    .select(GUARDIAN_SELECT)
    .eq("school_id", schoolId)
    .eq("id", guardianId)
    .maybeSingle();
  return data ? toResult(data as unknown as GuardianRow) : null;
}

/**
 * Guardian lookup for the "link an existing parent" picker.
 *
 * A guardian is school-scoped (D8), so this never crosses tenants: RLS binds
 * the rows and the school filter keeps a super admin inside the active school.
 */
export async function searchGuardians(opts: {
  schoolId: string;
  query?: string;
  limit?: number;
}): Promise<GuardianSearchResult[]> {
  const supabase = await createClient();

  let q = supabase
    .from("parents_guardians")
    .select(GUARDIAN_SELECT)
    .eq("school_id", opts.schoolId);

  const term = opts.query?.trim();
  if (term) {
    const escaped = term.replace(/[%,()]/g, " ");
    q = q.or(
      [
        `first_name.ilike.%${escaped}%`,
        `last_name.ilike.%${escaped}%`,
        `contact_number.ilike.%${escaped}%`,
      ].join(","),
    );
  }

  const { data } = await q
    .order("last_name")
    .order("first_name")
    .limit(opts.limit ?? 10);

  return ((data ?? []) as unknown as GuardianRow[]).map(toResult);
}
