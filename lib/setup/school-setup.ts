import type { createClient } from "@/lib/supabase/server";
import type { SetupCheck } from "@/components/admin/school-setup-checklist";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * What a school still needs before it works end to end, computed from the
 * database every time — never stored, so it cannot drift from what is true.
 *
 * Shared by the checklist on /super/schools/[id] and the Setup guide in the
 * app header. Ordered as the steps are actually taken: a year before sections
 * (sections belong to a year), fees and students before anything a parent
 * sees, the gate last because it needs hardware in hand.
 *
 * `isSuperAdmin` decides only where the "fix it" links point: the parent-card
 * and gate screens live under /super (D2), so a school admin gets no link to
 * a page that would bounce them to /dashboard.
 */
export async function getSchoolSetupChecks(
  supabase: Client,
  schoolId: string,
  { isSuperAdmin }: { isSuperAdmin: boolean },
): Promise<SetupCheck[]> {
  // Counts only — head:true asks PostgREST for the count and no rows, so the
  // checklist costs a handful of index lookups rather than a page of data.
  const count = (table: string, filters: Record<string, string> = {}) => {
    let q = supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("school_id", schoolId);
    for (const [col, value] of Object.entries(filters)) q = q.eq(col, value);
    return q;
  };

  const [
    yearsRes,
    sectionsRes,
    feeTypesRes,
    enrollmentsRes,
    devicesRes,
    notifyRes,
    settingsRes,
    cardsRes,
  ] = await Promise.all([
    count("school_years", { is_active: "true" }),
    count("sections"),
    count("fee_types"),
    count("student_enrollments", { status: "enrolled" }),
    count("gate_devices"),
    supabase
      .from("gate_notify_config")
      .select("enabled")
      .eq("school_id", schoolId)
      .maybeSingle(),
    supabase
      .from("school_settings")
      .select("key, value")
      .eq("school_id", schoolId)
      .in("key", ["telegram_bot", "gcash_number"]),
    // The VIEW, not pta.portal_accounts. That table has no read policy at all
    // (0016) -- RLS is row-level, and any policy letting staff see the row lets
    // them see card_number and pin_hash inside it. Counting the table would
    // always return 0 and report "no parent cards" for a school that has them.
    count("v_parent_cards_detail", { status: "active" }),
  ]);

  const settingSet = (key: string) => {
    const row = (settingsRes.data ?? []).find(
      (r) => (r as { key: string }).key === key,
    ) as { value?: unknown } | undefined;
    const v = row?.value;
    if (typeof v === "string") return v.trim().length > 0;
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const inner = o.username ?? o.number;
      return typeof inner === "string" && inner.trim().length > 0;
    }
    return false;
  };

  return [
    {
      label: "An active school year",
      done: (yearsRes.count ?? 0) > 0,
      detail:
        "Without one the gate roster is empty, the Parent Portal shows no children, and no payment can be recorded — pta.payments carries a foreign key to an enrolment.",
      silent: true,
      href: "/admin/school-years",
      hrefLabel: "Add one",
    },
    {
      label: "Sections",
      done: (sectionsRes.count ?? 0) > 0,
      detail: "Students are enrolled into a section; without one there is nowhere to put them.",
      href: "/admin/sections",
      hrefLabel: "Add sections",
    },
    {
      label: "Fee types",
      done: (feeTypesRes.count ?? 0) > 0,
      detail: "Nothing can be assessed or collected until the school's dues are defined.",
      href: "/charges/fees",
      hrefLabel: "Define fees",
    },
    {
      label: "Students enrolled",
      done: (enrollmentsRes.count ?? 0) > 0,
      detail: "Add them one at a time, or import the whole enrolment as a CSV.",
      href: "/students",
      hrefLabel: "Add students",
    },
    {
      label: "Gate notifications switched on",
      done: Boolean((notifyRes.data as { enabled?: boolean } | null)?.enabled),
      detail:
        "With no gate_notify_config row the gate records every tap and sends nothing. claim_notifications() returns on `not found` without writing a row, so this looks exactly like a broken trigger.",
      silent: true,
      href: "/admin/settings",
      hrefLabel: "Settings",
    },
    {
      label: "Telegram bot username",
      done: settingSet("telegram_bot"),
      detail:
        "Without it the portal's notification page tells parents the school has not finished setting up its bot, and the connect button has no link to open.",
      silent: true,
      href: "/admin/settings",
      hrefLabel: "Settings",
    },
    {
      label: "PTA GCash number",
      done: settingSet("gcash_number"),
      detail:
        "The payment screen quietly omits the step telling a parent where to send the money.",
      silent: true,
      href: "/admin/settings",
      hrefLabel: "Settings",
    },
    {
      label: "A gate reader registered",
      done: (devicesRes.count ?? 0) > 0,
      detail: isSuperAdmin
        ? "pta.gate_devices maps a device id to this school, and that mapping is the tenancy key — record_attendance() refuses an unregistered device outright, and the reader queues its taps on flash instead of losing them."
        : "The gate card reader is registered to this school by the system administrator when the hardware is installed. Until then no tap is recorded.",
      silent: true,
      href: isSuperAdmin ? `/super/attendance?school=${schoolId}` : undefined,
      hrefLabel: "Gate monitor",
    },
    {
      label: "Parent cards issued",
      done: (cardsRes.count ?? 0) > 0,
      detail:
        "A card is minted automatically when a guardian is linked to a student. None yet means no guardian has been linked, so no parent can reach the Parent Portal.",
      href: isSuperAdmin ? `/super/parent-cards?school=${schoolId}` : "/students",
      hrefLabel: isSuperAdmin ? "Parent cards" : "Students",
    },
  ];
}
