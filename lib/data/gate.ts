import { createClient } from "@/lib/supabase/server";
import { formatNameListing } from "@/lib/utils/names";
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

/* ---------------------------------------------------------------------------
 * Who hears about a tap
 * ------------------------------------------------------------------------- */

/**
 * What the monitor can say about a student's guardians without guessing.
 *
 * `reachable` is the number that matters, and it is deliberately the SAME three
 * conditions pta.claim_notifications() applies when it decides who to send to
 * (0013): the link says notify, the guardian's Telegram is active, and there is
 * a chat id. Anything less than all three and the message is not sent, so a
 * board that showed "linked" on the strength of a chat id alone would be
 * telling the office a parent was told when nobody was.
 */
export interface GuardianNotice {
  /** The guardian to name in the column: whoever would actually get the
   *  message, else the primary, else the first alphabetically. */
  name: string;
  relationship: string | null;
  /** Guardians on file for this student. */
  total: number;
  /** Guardians holding a Telegram chat id, muted or not. */
  linked: number;
  /** Guardians who would actually receive a gate alert. */
  reachable: number;
}

interface GuardianLinkRow {
  student_id: string;
  relationship: string | null;
  is_primary: boolean;
  notify: boolean;
  guardian: {
    first_name: string;
    middle_name: string | null;
    last_name: string;
    suffix: string | null;
    telegram_chat_id: string | null;
    telegram_active: boolean;
  } | null;
}

/**
 * Guardian notification state for a handful of students.
 *
 * Scoped to the ids on screen rather than the whole school on purpose: the
 * monitor re-runs every thirty seconds, and a school with four thousand
 * students has several thousand guardian links. Reading all of them to label a
 * hundred and twenty rows would be the most expensive query on the page, over
 * and over, for data nobody is looking at.
 */
export async function getGuardianNotices(
  schoolId: string,
  studentIds: string[],
): Promise<Map<string, GuardianNotice>> {
  const notices = new Map<string, GuardianNotice>();
  const ids = [...new Set(studentIds)];
  if (ids.length === 0) return notices;

  const supabase = await createClient();
  const { data } = await supabase
    .from("student_guardians")
    .select(
      "student_id, relationship, is_primary, notify, guardian:parents_guardians(first_name, middle_name, last_name, suffix, telegram_chat_id, telegram_active)",
    )
    .eq("school_id", schoolId)
    .in("student_id", ids);

  const byStudent = new Map<string, GuardianLinkRow[]>();
  for (const row of (data ?? []) as unknown as GuardianLinkRow[]) {
    if (!row.guardian) continue;
    const list = byStudent.get(row.student_id) ?? [];
    list.push(row);
    byStudent.set(row.student_id, list);
  }

  for (const [studentId, links] of byStudent) {
    const isReachable = (l: GuardianLinkRow) =>
      l.notify && !!l.guardian?.telegram_active && !!l.guardian?.telegram_chat_id;

    const named =
      links.find(isReachable) ??
      links.find((l) => l.is_primary) ??
      [...links].sort((a, b) =>
        formatNameListing(a.guardian!).localeCompare(
          formatNameListing(b.guardian!),
        ),
      )[0];

    notices.set(studentId, {
      name: formatNameListing(named.guardian!),
      relationship: named.relationship,
      total: links.length,
      linked: links.filter((l) => !!l.guardian?.telegram_chat_id).length,
      reachable: links.filter(isReachable).length,
    });
  }

  return notices;
}
