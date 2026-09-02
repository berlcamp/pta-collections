import { CreditCard, IdCard, Radio, UserRoundX } from "lucide-react";

import { requireSuperAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { resolveGateSchool } from "@/lib/data/gate";
import { PageHeader, SectionHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState } from "@/components/common/empty-state";
import { GateSchoolPicker } from "@/components/gate/gate-school-picker";
import {
  CardEnrolment,
  type QueueCard,
  type RosterOption,
} from "@/components/gate/card-enrolment";
import { ClearQueueButton } from "@/components/gate/clear-queue-button";
import { LiveRefresh } from "@/components/gate/live-refresh";
import {
  StudentCardsTable,
  type StudentCardRow,
} from "@/components/tables/student-cards-table";
import type {
  GateRosterEntry,
  StudentCardDetail,
  UnassignedCard,
} from "@/types/database.types";

export const dynamic = "force-dynamic";

/**
 * Card enrolment — binding a physical card to a student.
 *
 * The card UID is not a column on students, and this page is why: cards get
 * lost and reissued. pta.student_cards keeps the issue/revoke history, so a
 * scan always resolves to whoever held that card AT THAT MOMENT and reissuing
 * never silently rewrites last term's attendance.
 *
 * Both writes go through the RPCs in 0015 rather than table writes, so
 * retire-then-issue is one transaction and both land in the audit log.
 */

/** The queue is a working list, not an archive. A school with thousands of
 *  stray UIDs has a different problem than enrolment. */
const QUEUE_LIMIT = 200;

export default async function CardEnrolmentPage({
  searchParams,
}: {
  searchParams: Promise<{ school?: string; card?: string }>;
}) {
  const ctx = await requireSuperAdmin();
  const { school: schoolParam, card: cardParam } = await searchParams;

  const { schools, school } = await resolveGateSchool(
    schoolParam,
    ctx.activeSchool?.id ?? null,
  );

  if (!school) {
    return (
      <>
        <PageHeader title="Card enrolment" />
        <EmptyState
          icon={Radio}
          title="No active school"
          description="Create a school before issuing gate cards for it."
        />
      </>
    );
  }

  const supabase = await createClient();

  const [queueRes, cardsRes, rosterRes] = await Promise.all([
    supabase
      .from("v_unassigned_cards")
      .select("*")
      .eq("school_id", school.id)
      .order("last_seen_at", { ascending: false })
      .limit(QUEUE_LIMIT),
    supabase
      .from("v_student_cards_detail")
      .select("*")
      .eq("school_id", school.id)
      .is("revoked_at", null)
      .order("issued_at", { ascending: false }),
    supabase
      .from("gate_roster")
      .select("student_id,full_name,student_no,grade_level,section_name")
      .eq("school_id", school.id)
      .order("full_name"),
  ]);

  const queueRows = (queueRes.data ?? []) as UnassignedCard[];
  const cards = (cardsRes.data ?? []) as StudentCardDetail[];
  const roster = (rosterRes.data ?? []) as Omit<
    GateRosterEntry,
    "school_id" | "school_year_id"
  >[];

  const cardsPerStudent = new Map<string, number>();
  for (const c of cards) {
    cardsPerStudent.set(c.student_id, (cardsPerStudent.get(c.student_id) ?? 0) + 1);
  }

  const queue: QueueCard[] = queueRows.map((c) => ({
    card_uid: c.card_uid,
    scan_count: c.scan_count,
    first_seen_at: c.first_seen_at,
    last_seen_at: c.last_seen_at,
    last_device_id: c.last_device_id,
  }));

  const rosterOptions: RosterOption[] = roster.map((r) => ({
    student_id: r.student_id,
    full_name: r.full_name,
    student_no: r.student_no,
    grade_level: r.grade_level,
    section_name: r.section_name,
    card_count: cardsPerStudent.get(r.student_id) ?? 0,
  }));

  const cardRows: StudentCardRow[] = cards.map((c) => ({
    id: c.id,
    card_uid: c.card_uid,
    student_name: c.student_name,
    student_no: c.student_no,
    grade_level: c.grade_level,
    section_name: c.section_name,
    issued_at: c.issued_at,
    last_used_at: c.last_used_at,
    // gate_roster only carries the ACTIVE school year, so a null grade level
    // here means the holder has left it — graduated, or transferred out.
    on_roster: c.grade_level !== null,
  }));

  const withoutCard = rosterOptions.filter((r) => r.card_count === 0).length;

  return (
    <>
      <PageHeader
        title="Card enrolment"
        description="Bind a physical RFID card to a student on the roster. Students themselves are created under Students — a student invented here would have no enrolment, and so no section, number or fees."
        actions={<GateSchoolPicker schools={schools} selected={school.id} />}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Waiting to be enrolled"
          value={queue.length.toLocaleString()}
          hint="cards tapped, owned by nobody"
          icon={CreditCard}
          tone={queue.length > 0 ? "warning" : "default"}
          action={<ClearQueueButton schoolId={school.id} count={queue.length} />}
        />
        <StatCard
          label="Cards in circulation"
          value={cards.length.toLocaleString()}
          icon={IdCard}
        />
        <StatCard
          label="Students with a card"
          value={(rosterOptions.length - withoutCard).toLocaleString()}
          hint={`of ${rosterOptions.length.toLocaleString()} enrolled`}
          icon={IdCard}
          tone="positive"
        />
        <StatCard
          label="Students without one"
          value={withoutCard.toLocaleString()}
          hint="they cannot appear on the gate board"
          icon={UserRoundX}
          tone={withoutCard > 0 ? "warning" : "default"}
        />
      </div>

      <div className="mt-8">
        {/* Enrolment is done AT this screen with a reader in the other hand, so
            the list has to find the card by itself — an operator holding a card
            against the gate should not have to think about reloading a page to
            see it. Ten seconds is the shortest interval the monitor offers and
            about as long as tapping a card and looking up takes. Same component
            as the live monitor, and for the same reason: polling a
            force-dynamic page keeps every read inside the RLS-bound client,
            where Postgres realtime would need a publication change on a
            database shared with two other apps. */}
        <SectionHeader
          title="Unassigned cards"
          description="Tap a card on the reader and it appears here within seconds, newest first. Clear the list whenever it gets noisy — a card that matters comes back the moment it is tapped again."
          actions={<LiveRefresh defaultSeconds={10} />}
        />
        <CardEnrolment
          queue={queue}
          roster={rosterOptions}
          schoolId={school.id}
          timezone={school.timezone}
          preselected={cardParam?.toUpperCase()}
        />
      </div>

      <div className="mt-8">
        <SectionHeader
          title="Issued cards"
          description="Every card currently in circulation at this school."
        />
        {cardRows.length === 0 ? (
          <EmptyState
            icon={IdCard}
            title="No cards issued yet"
            description="Nothing is bound to a student at this school. Tap a card on the reader and it will show up above."
          />
        ) : (
          <StudentCardsTable rows={cardRows} timezone={school.timezone} />
        )}
      </div>
    </>
  );
}
