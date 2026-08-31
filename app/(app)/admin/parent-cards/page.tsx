import { ParentCardManager } from "@/components/portal/parent-card-manager";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type {
  ParentCardDetail,
  ParentCardPending,
} from "@/types/database.types";

export const dynamic = "force-dynamic";

/**
 * Parent cards.
 *
 * Admin and treasurer only. A cashier may take money all day, but issuing a
 * parent card decides who can watch a child move through the school gate — and
 * the same cashier reads card numbers off the POS scanner, which is exactly why
 * a PIN reset is a staff action rather than a self-service link.
 */
export default async function ParentCardsPage() {
  const { activeSchool } = await requireRole(["admin", "treasurer"]);

  const supabase = await createClient();

  const [{ data: issued }, { data: pending }, { data: pinRequired }] = await Promise.all([
    supabase
      .from("v_parent_cards_detail")
      .select("*")
      .eq("school_id", activeSchool.id)
      .order("guardian_name"),
    supabase
      .from("v_parent_cards_pending")
      .select("*")
      .eq("school_id", activeSchool.id)
      .order("guardian_name"),
    supabase.rpc("portal_pin_required", { p_school_id: activeSchool.id }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Parent cards</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          A parent card is a 16-digit barcode a guardian uses to sign in to the
          Parent Portal, and that a cashier can scan at the counter to pull up
          their children. Issuing one shows the number{" "}
          {pinRequired ? "and a temporary PIN " : ""}
          <strong>once</strong> — it cannot be retrieved afterwards.
        </p>
        {!pinRequired && (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            This school signs parents in with the card alone. Anyone holding the
            number can see a child&apos;s gate arrivals, so treat a lost card
            the way you would a lost key: revoke it here and issue a new one.
            Add a PIN under{" "}
            <strong>Administration → Settings → Parent Portal</strong>.
          </p>
        )}
      </div>

      <ParentCardManager
        issued={(issued ?? []) as ParentCardDetail[]}
        pending={(pending ?? []) as ParentCardPending[]}
        pinRequired={Boolean(pinRequired)}
      />
    </div>
  );
}
