import { createClient } from "@/lib/supabase/server";
import type { School } from "@/types/database.types";

/**
 * School scoping for the gate pages.
 *
 * These live under /super, where a super admin usually has NO active school —
 * the switcher's global context is deliberately not "some arbitrary school's
 * data" (D2). So the gate pages carry their own picker on `?school=`, and this
 * resolves it: the requested school if it is one the caller may see, otherwise
 * whatever school they are already working inside, otherwise the first.
 *
 * `schools` comes back from the RLS-bound client, so the list is already
 * exactly what the caller is allowed to pick from. There is no second check
 * here for the same reason there is none in the header switcher.
 */
export async function resolveGateSchool(
  requested: string | undefined,
  activeSchoolId: string | null,
): Promise<{ schools: School[]; school: School | null }> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("schools")
    .select("*")
    .eq("active", true)
    .order("name");

  const schools = (data ?? []) as School[];
  const school =
    schools.find((s) => s.id === requested) ??
    schools.find((s) => s.id === activeSchoolId) ??
    schools[0] ??
    null;

  return { schools, school };
}

/** Seconds between two ISO timestamps, or null when either is missing. */
export function secondsBetween(
  later: string | null | undefined,
  earlier: string | null | undefined,
): number | null {
  if (!later || !earlier) return null;
  return Math.max(0, (Date.parse(later) - Date.parse(earlier)) / 1000);
}

/** "4m ago", "2h ago" — for liveness, where the exact second is noise. */
export function formatAgo(seconds: number | null): string {
  if (seconds === null) return "never";
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
