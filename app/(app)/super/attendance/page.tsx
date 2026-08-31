import { CircleHelp, GraduationCap, Radio, ScanLine, UserCheck } from "lucide-react";

import { requireSuperAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { resolveGateSchool } from "@/lib/data/gate";
import { todayInTimezone } from "@/lib/utils/dates";
import { PageHeader, SectionHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState } from "@/components/common/empty-state";
import { GateSchoolPicker } from "@/components/gate/gate-school-picker";
import { GateDateFilter } from "@/components/gate/gate-date-filter";
import { LiveRefresh } from "@/components/gate/live-refresh";
import { DeviceStrip } from "@/components/gate/device-strip";
import {
  AttendanceFeedTable,
  type AttendanceFeedRow,
} from "@/components/tables/attendance-feed-table";
import {
  GateRosterTable,
  type RosterStatusRow,
} from "@/components/tables/gate-roster-table";
import type {
  AttendanceScan,
  GateDeviceStatus,
  GateRosterEntry,
} from "@/types/database.types";

export const dynamic = "force-dynamic";

/**
 * Live attendance monitor.
 *
 * Reads the RFID gate's rows the same way every other page in this app reads:
 * through the RLS-bound user client. The gate's own board holds service_role
 * and scopes itself in application code (0013, exception 2); nothing here does,
 * because here Postgres is still the one deciding what may be seen.
 *
 * Two honesty rules the page is built around:
 *
 *   1. A scan is a CARD passing a reader. "Arrived" is this page's rule — the
 *      first scan of the day — not a measurement. The roster panel says so.
 *   2. A student with no card cannot appear, so their absence from the board
 *      means nothing. That is a labelled column, not a footnote.
 */

/** Enough to cover a large school's whole morning; the feed shows the newest. */
const DAY_SCAN_LIMIT = 5000;
const FEED_LIMIT = 120;

export default async function GateMonitorPage({
  searchParams,
}: {
  searchParams: Promise<{ school?: string; date?: string }>;
}) {
  const ctx = await requireSuperAdmin();
  const { school: schoolParam, date: dateParam } = await searchParams;

  const { schools, school } = await resolveGateSchool(
    schoolParam,
    ctx.activeSchool?.id ?? null,
  );

  if (!school) {
    return (
      <>
        <PageHeader title="Live attendance" />
        <EmptyState
          icon={Radio}
          title="No active school"
          description="Create a school before wiring a gate reader to it."
        />
      </>
    );
  }

  // The day boundary is the school's, computed the same way SQL computes it
  // (D11) — v_attendance_local carries local_date so the two agree.
  const date = dateParam ?? todayInTimezone(school.timezone);
  const isToday = date === todayInTimezone(school.timezone);

  const supabase = await createClient();

  const [devicesRes, dayRes, feedRes, rosterRes, cardsRes] = await Promise.all([
    supabase
      .from("v_gate_device_status")
      .select("*")
      .eq("school_id", school.id)
      .order("label", { nullsFirst: false }),
    // Ascending: the FIRST scan of the day is what makes an arrival, and taking
    // it from a descending list would silently record the last tap instead.
    supabase
      .from("v_attendance_local")
      .select("event_id,student_id,card_uid,scanned_at,queued,clock_synced")
      .eq("school_id", school.id)
      .eq("local_date", date)
      .order("scanned_at", { ascending: true })
      .limit(DAY_SCAN_LIMIT),
    supabase
      .from("v_attendance_local")
      .select("*")
      .eq("school_id", school.id)
      .eq("local_date", date)
      .order("scanned_at", { ascending: false })
      .limit(FEED_LIMIT),
    supabase
      .from("gate_roster")
      .select("student_id,full_name,student_no,grade_level,section_name")
      .eq("school_id", school.id)
      .order("full_name"),
    supabase
      .from("student_cards")
      .select("student_id")
      .eq("school_id", school.id)
      .is("revoked_at", null),
  ]);

  const devices = (devicesRes.data ?? []) as GateDeviceStatus[];
  const day = (dayRes.data ?? []) as Pick<
    AttendanceScan,
    "event_id" | "student_id" | "card_uid" | "scanned_at" | "queued" | "clock_synced"
  >[];
  const feed = (feedRes.data ?? []) as AttendanceScan[];
  const roster = (rosterRes.data ?? []) as Omit<GateRosterEntry, "school_id" | "school_year_id">[];
  const carded = new Set(
    ((cardsRes.data ?? []) as { student_id: string }[]).map((c) => c.student_id),
  );

  // First scan per student == arrival. `day` is ascending, so the first row a
  // student appears in is the one that counts.
  const firstScan = new Map<string, (typeof day)[number]>();
  for (const scan of day) {
    if (scan.student_id && !firstScan.has(scan.student_id)) {
      firstScan.set(scan.student_id, scan);
    }
  }

  const unknown = day.filter((s) => s.student_id === null);
  const unknownCards = new Set(unknown.map((s) => s.card_uid));

  const time = (iso: string) =>
    new Intl.DateTimeFormat("en-PH", {
      timeZone: school.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));

  const feedRows: AttendanceFeedRow[] = feed.map((s) => ({
    event_id: s.event_id,
    time: time(s.scanned_at),
    scanned_at: s.scanned_at,
    student_id: s.student_id,
    student_name: s.full_name,
    student_no: s.student_no,
    section: s.section_name,
    card_uid: s.card_uid,
    device_id: s.device_id,
    queued: s.queued,
    clock_synced: s.clock_synced,
  }));

  const rosterRows: RosterStatusRow[] = roster.map((r) => {
    const first = firstScan.get(r.student_id);
    return {
      student_id: r.student_id,
      name: r.full_name,
      student_no: r.student_no,
      grade_level: r.grade_level,
      section: r.section_name,
      arrived_at: first?.scanned_at ?? null,
      arrived_time: first ? time(first.scanned_at) : null,
      estimated: first ? !first.clock_synced : false,
      late_delivery: first ? first.queued : false,
      has_card: carded.has(r.student_id),
    };
  });

  const withoutCard = rosterRows.filter((r) => !r.has_card).length;
  const truncated = day.length >= DAY_SCAN_LIMIT;

  return (
    <>
      <PageHeader
        title="Live attendance"
        description={
          isToday
            ? "Card taps at the school gate, as they arrive."
            : `Gate activity for ${date}.`
        }
        actions={
          <>
            <GateSchoolPicker schools={schools} selected={school.id} />
            {/* A date input, because a parent asking "was my child at school on
                Tuesday" is the second thing this page is ever used for. */}
            <GateDateFilter
              date={date}
              max={todayInTimezone(school.timezone)}
            />
            {isToday && <LiveRefresh defaultSeconds={30} />}
          </>
        }
      />

      <DeviceStrip
        devices={devices}
        timezone={school.timezone}
        nowIso={new Date().toISOString()}
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Arrived"
          value={firstScan.size.toLocaleString()}
          hint={`of ${roster.length.toLocaleString()} enrolled`}
          icon={UserCheck}
          tone="positive"
        />
        <StatCard
          label="Not yet scanned"
          value={Math.max(0, roster.length - firstScan.size).toLocaleString()}
          hint={
            withoutCard > 0
              ? `${withoutCard} of them hold no card`
              : "every student holds a card"
          }
          icon={GraduationCap}
        />
        <StatCard
          label="Scans"
          value={`${day.length.toLocaleString()}${truncated ? "+" : ""}`}
          hint={truncated ? `showing the first ${DAY_SCAN_LIMIT}` : "taps today"}
          icon={ScanLine}
        />
        <StatCard
          label="Unknown cards"
          value={unknownCards.size.toLocaleString()}
          hint={
            unknownCards.size > 0
              ? `${unknown.length} tap${unknown.length === 1 ? "" : "s"} — enrol them`
              : "every card is assigned"
          }
          icon={CircleHelp}
          tone={unknownCards.size > 0 ? "warning" : "default"}
        />
      </div>

      <div className="mt-8">
        <SectionHeader
          title="Recent scans"
          description={`Newest first, latest ${FEED_LIMIT}. A row is a card passing the reader — not a presence claim.`}
        />
        {feedRows.length === 0 ? (
          <EmptyState
            icon={ScanLine}
            title="No scans on this date"
            description="Nothing has passed the reader. If that is a surprise, check the reader's last upload above."
          />
        ) : (
          <AttendanceFeedTable rows={feedRows} schoolId={school.id} />
        )}
      </div>

      <div className="mt-8">
        <SectionHeader
          title="Roster"
          description="Arrived means the student's FIRST scan of the day. One reader cannot tell in from out, so this page does not pretend to."
        />
        {rosterRows.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No one enrolled in the active school year"
            description="The gate roster is this school's students enrolled in its active school year. Set one up under Administration → School years."
          />
        ) : (
          <GateRosterTable rows={rosterRows} />
        )}
      </div>
    </>
  );
}
