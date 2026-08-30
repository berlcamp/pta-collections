import { createClient } from "@/lib/supabase/server";

export interface GuardianSearchResult {
  id: string;
  first_name: string;
  last_name: string;
  contact_number: string | null;
  email: string | null;
  /** Students in this school already linked to this guardian — i.e. siblings. */
  student_count: number;
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
    .select(
      "id, first_name, last_name, contact_number, email, links:student_guardians(student_id)",
    )
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

  return ((data ?? []) as unknown as {
    id: string;
    first_name: string;
    last_name: string;
    contact_number: string | null;
    email: string | null;
    links: { student_id: string }[] | null;
  }[]).map((g) => ({
    id: g.id,
    first_name: g.first_name,
    last_name: g.last_name,
    contact_number: g.contact_number,
    email: g.email,
    student_count: g.links?.length ?? 0,
  }));
}
