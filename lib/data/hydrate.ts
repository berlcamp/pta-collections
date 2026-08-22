import { createClient } from "@/lib/supabase/server";

/**
 * Batch-fetch display names for a set of payments.
 *
 * Why not PostgREST embedded joins? Because these queries read from
 * `pta.v_payments_local` (a VIEW, needed for the Asia/Manila collection_date),
 * and PostgREST can only embed through a view when it manages to infer the
 * relationship from the view's column provenance. That inference is fragile and
 * fails silently — you get rows with `student: null` rather than an error.
 * Two explicit lookups are a few more lines and cannot break that way.
 */

export interface NameLookup {
  students: Map<
    string,
    {
      first_name: string;
      middle_name: string | null;
      last_name: string;
      suffix: string | null;
    }
  >;
  profiles: Map<string, string>;
}

export async function lookupNames(
  studentIds: string[],
  profileIds: string[],
): Promise<NameLookup> {
  const supabase = await createClient();
  const uniqueStudents = [...new Set(studentIds)].filter(Boolean);
  const uniqueProfiles = [...new Set(profileIds)].filter(Boolean);

  const [studentsRes, profilesRes] = await Promise.all([
    uniqueStudents.length
      ? supabase
          .from("students")
          .select("id, first_name, middle_name, last_name, suffix")
          .in("id", uniqueStudents)
      : Promise.resolve({ data: [] }),
    uniqueProfiles.length
      ? supabase.from("profiles").select("id, full_name").in("id", uniqueProfiles)
      : Promise.resolve({ data: [] }),
  ]);

  type S = {
    id: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    suffix: string | null;
  };

  return {
    students: new Map(
      ((studentsRes.data ?? []) as S[]).map((s) => [
        s.id,
        {
          first_name: s.first_name,
          middle_name: s.middle_name,
          last_name: s.last_name,
          suffix: s.suffix,
        },
      ]),
    ),
    profiles: new Map(
      ((profilesRes.data ?? []) as { id: string; full_name: string }[]).map((p) => [
        p.id,
        p.full_name,
      ]),
    ),
  };
}

/** Fee-type names for a set of payments, allocated per payment. */
export async function lookupPaymentFeeNames(
  paymentIds: string[],
): Promise<Map<string, string[]>> {
  const supabase = await createClient();
  const unique = [...new Set(paymentIds)].filter(Boolean);
  if (unique.length === 0) return new Map();

  const { data } = await supabase
    .from("payment_items")
    .select("payment_id, charge:student_charges(fee_type_id, fee_type:fee_types(name))")
    .in("payment_id", unique);

  type Row = {
    payment_id: string;
    charge: { fee_type_id: string; fee_type: { name: string } | null } | null;
  };

  const map = new Map<string, string[]>();
  for (const row of (data ?? []) as unknown as Row[]) {
    const name = row.charge?.fee_type?.name;
    if (!name) continue;
    const list = map.get(row.payment_id) ?? [];
    if (!list.includes(name)) list.push(name);
    map.set(row.payment_id, list);
  }
  return map;
}

/** Which payments touched a given fee type — for the collection report filter. */
export async function paymentIdsForFeeType(
  paymentIds: string[],
  feeTypeId: string,
): Promise<Set<string>> {
  const supabase = await createClient();
  const unique = [...new Set(paymentIds)].filter(Boolean);
  if (unique.length === 0) return new Set();

  const { data } = await supabase
    .from("payment_items")
    .select("payment_id, charge:student_charges!inner(fee_type_id)")
    .in("payment_id", unique)
    .eq("student_charges.fee_type_id", feeTypeId);

  return new Set(
    ((data ?? []) as { payment_id: string }[]).map((r) => r.payment_id),
  );
}
