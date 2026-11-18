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
    .is("merged_into", null)
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
    .eq("school_id", opts.schoolId)
    .is("merged_into", null);

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

export interface GuardianDuplicateSide {
  id: string;
  name: string;
  contact: string | null;
  children: string | null;
  /** Masked card and its status, when this record holds one. */
  card: { masked: string; status: string } | null;
}

export interface GuardianDuplicatePair {
  reasons: ("same_number" | "same_name" | "similar_name")[];
  a: GuardianDuplicateSide;
  b: GuardianDuplicateSide;
}

/**
 * Likely duplicate parents (pta.v_guardian_duplicates, 0027), with each side's
 * parent card — because which record holds the card decides which one is kept.
 * Cards come from the masked v_parent_cards_detail; the number never leaves SQL.
 */
export async function getGuardianDuplicates(
  schoolId: string,
): Promise<GuardianDuplicatePair[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_guardian_duplicates")
    .select("a_id,b_id,reasons,a_name,a_contact,a_children,b_name,b_contact,b_children")
    .eq("school_id", schoolId)
    .order("a_name")
    .limit(500);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as {
    a_id: string;
    b_id: string;
    reasons: GuardianDuplicatePair["reasons"];
    a_name: string;
    a_contact: string | null;
    a_children: string | null;
    b_name: string;
    b_contact: string | null;
    b_children: string | null;
  }[];

  const ids = [...new Set(rows.flatMap((r) => [r.a_id, r.b_id]))];
  const cards = new Map<string, { masked: string; status: string }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: c } = await supabase
      .from("v_parent_cards_detail")
      .select("guardian_id,card_masked,status")
      .in("guardian_id", ids.slice(i, i + 200));
    for (const r of (c ?? []) as { guardian_id: string; card_masked: string; status: string }[]) {
      cards.set(r.guardian_id, { masked: r.card_masked, status: r.status });
    }
  }

  return rows.map((r) => ({
    reasons: r.reasons,
    a: {
      id: r.a_id,
      name: r.a_name,
      contact: r.a_contact,
      children: r.a_children,
      card: cards.get(r.a_id) ?? null,
    },
    b: {
      id: r.b_id,
      name: r.b_name,
      contact: r.b_contact,
      children: r.b_children,
      card: cards.get(r.b_id) ?? null,
    },
  }));
}
