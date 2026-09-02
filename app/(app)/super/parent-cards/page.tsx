import { IdCard, Radio, ShieldAlert, UserRoundPlus, Send } from "lucide-react";

import { requireSuperAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { resolveGateSchool } from "@/lib/data/gate";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState } from "@/components/common/empty-state";
import { GateSchoolPicker } from "@/components/gate/gate-school-picker";
import { ParentCardRosterButton } from "@/components/portal/parent-card-roster-button";
import { ParentCardManager } from "@/components/portal/parent-card-manager";
import type {
  ParentCardDetail,
  ParentCardPending,
} from "@/types/database.types";

export const dynamic = "force-dynamic";

/**
 * Parent cards.
 *
 * A parent card is a 16-digit barcode a guardian signs in to the Parent Portal
 * with, and that a cashier scans at the counter to pull up their children.
 *
 * It sits under Gate attendance rather than Administration because that is what
 * the card is FOR: it is the parent-facing half of the same reader — the card
 * enrolled on the next tab is what a child taps, and this one is what lets the
 * family watch those taps. School-scoped by the `?school=` picker like its two
 * sibling pages, because a super admin arrives at /super with no active school
 * (D2); the RPCs underneath still take their own decision via
 * require_school_role() on the guardian's school, not from the picker.
 */
export default async function ParentCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ school?: string }>;
}) {
  const ctx = await requireSuperAdmin();
  const { school: schoolParam } = await searchParams;

  const { schools, school } = await resolveGateSchool(
    schoolParam,
    ctx.activeSchool?.id ?? null,
  );

  if (!school) {
    return (
      <>
        <PageHeader title="Parent cards" />
        <EmptyState
          icon={Radio}
          title="No active school"
          description="Create a school before issuing parent cards for it."
        />
      </>
    );
  }

  const supabase = await createClient();

  const [issuedRes, pendingRes, pinRes] = await Promise.all([
    supabase
      .from("v_parent_cards_detail")
      .select("*")
      .eq("school_id", school.id)
      .order("guardian_name"),
    supabase
      .from("v_parent_cards_pending")
      .select("*")
      .eq("school_id", school.id)
      .order("guardian_name"),
    supabase.rpc("portal_pin_required", { p_school_id: school.id }),
  ]);

  const issued = (issuedRes.data ?? []) as ParentCardDetail[];
  const pending = (pendingRes.data ?? []) as ParentCardPending[];
  const pinRequired = Boolean(pinRes.data);

  const active = issued.filter((c) => c.status === "active");
  const revoked = issued.length - active.length;
  const neverUsed = active.filter((c) => c.last_login_at === null).length;
  const telegram = active.filter((c) => c.telegram_linked).length;

  return (
    <>
      <PageHeader
        title="Parent cards"
        description={
          pinRequired
            ? "A 16-digit barcode a guardian signs in to the Parent Portal with. Every guardian with a child on file is issued one automatically; the PIN nobody saw is replaced with Reset PIN, at the counter."
            : "A 16-digit barcode a guardian signs in to the Parent Portal with, issued automatically to every guardian with a child on file. This school signs parents in with the card alone, so whoever holds the number sees that child's gate arrivals — revoke a lost one the way you would change a lock."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <GateSchoolPicker schools={schools} selected={school.id} />
            {/* The only door to card numbers in bulk. It downloads a file and
                renders nothing — the numbers never reach a screen. Audited on
                every click; see pta.parent_card_roster() in 0022. */}
            <ParentCardRosterButton
              schoolId={school.id}
              schoolCode={school.school_code}
              disabled={active.length === 0}
            />
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Cards in circulation"
          value={active.length.toLocaleString()}
          hint={`of ${(active.length + pending.length).toLocaleString()} guardians with a child`}
          icon={IdCard}
          tone="positive"
        />
        {/* Should read zero. Issuance is automatic (0022), so this counts the
            guardians the trigger failed on — a repair queue, not a work queue. */}
        <StatCard
          label="Missed a card"
          value={pending.length.toLocaleString()}
          hint={
            pending.length > 0
              ? "issuance did not run for them — issue by hand"
              : "issuance is automatic, and nobody was missed"
          }
          icon={UserRoundPlus}
          tone={pending.length > 0 ? "warning" : "positive"}
        />
        <StatCard
          label="Never signed in"
          value={neverUsed.toLocaleString()}
          hint="issued, but the slip may never have arrived"
          icon={IdCard}
        />
        <StatCard
          label="Telegram linked"
          value={telegram.toLocaleString()}
          hint={
            revoked > 0
              ? `${revoked} card${revoked === 1 ? "" : "s"} revoked`
              : "they get a message on every tap"
          }
          icon={revoked > 0 ? ShieldAlert : Send}
        />
      </div>

      <ParentCardManager
        issued={issued}
        pending={pending}
        pinRequired={pinRequired}
        timezone={school.timezone}
        // Every viewer of this page is a super admin, so this is always true
        // today. It is a prop rather than a constant because the component is
        // one edit away from being reachable from a school-scoped screen, and
        // 0020's grant is the thing that must not drift.
        canReveal={ctx.isSuperAdmin}
      />
    </>
  );
}
