import { ShieldCheck } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { ServerPagination } from "@/components/common/server-pagination";
import { AuditLogsTable } from "@/components/tables/audit-logs-table";
import { formatDateTime } from "@/lib/utils/dates";

export const dynamic = "force-dynamic";

const ACTION_LABELS: Record<string, string> = {
  PAYMENT_CREATED: "Payment recorded",
  PAYMENT_VOIDED: "Payment voided",
  CHARGE_CREATED: "Charge created",
  CHARGE_WAIVED: "Charge waived",
  CHARGE_CANCELLED: "Charge cancelled",
  FEES_ASSESSED: "Fees assessed",
  IMPORT_COMMITTED: "Students imported",
  USER_INVITED: "User invited",
  USER_INVITE_CLAIMED: "Invitation claimed",
  USER_STATUS_CHANGED: "User access changed",
  SCHOOL_CREATED: "School created",
  CARD_ASSIGNED: "Gate card assigned",
  CARD_REVOKED: "Gate card retired",
  PROFILE_BOUND: "Profile linked",
  PORTAL_CARD_ISSUED: "Parent card issued",
  PORTAL_CARD_REVOKED: "Parent card revoked",
  PORTAL_PIN_RESET: "Parent PIN reset",
  // A super admin read a card number back off the screen (0020). Listed here
  // because this is the log the school's own admin reads, and being able to
  // see that it happened is the point of auditing it.
  PORTAL_CARD_REVEALED: "Parent card number shown",
};

const PAGE_SIZE = 100;

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const ctx = await requireRole(["admin", "treasurer"]);
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? 1));
  const pageSize = PAGE_SIZE;

  const supabase = await createClient();
  const { data, count } = await supabase
    .from("audit_logs")
    .select("*, actor:profiles(full_name, email)", { count: "exact" })
    .eq("school_id", ctx.activeSchool.id)
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  type Row = {
    id: string;
    action: string;
    entity_type: string;
    entity_id: string | null;
    new_values: Record<string, unknown> | null;
    acting_as_super_admin: boolean;
    created_at: string;
    actor: { full_name: string; email: string } | null;
  };

  const rows = (data ?? []) as unknown as Row[];

  return (
    <>
      <PageHeader
        title="Audit logs"
        description={`${count ?? 0} entries. This table is append-only — nobody, including administrators, can edit or delete a row.`}
      />

      {rows.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No activity recorded yet" />
      ) : (
        <div className="space-y-4">
          <AuditLogsTable
            rows={rows.map((r) => ({
              id: r.id,
              when: formatDateTime(r.created_at, ctx.activeSchool.timezone),
              action: r.action,
              action_label: ACTION_LABELS[r.action] ?? r.action,
              actor_name: r.actor?.full_name ?? "System",
              actor_email: r.actor?.email ?? null,
              acting_as_super_admin: r.acting_as_super_admin,
              detail: auditDetail(r.action, r.new_values),
            }))}
          />
          <ServerPagination
            page={page}
            pages={Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE))}
            total={count ?? 0}
            pageSize={PAGE_SIZE}
            noun="entry"
          />
        </div>
      )}
    </>
  );
}

/** Condenses a log row's JSON payload into one readable line. */
function auditDetail(
  action: string,
  values: Record<string, unknown> | null,
): string {
  if (!values) return "—";

  const pick = (k: string) => (values[k] != null ? String(values[k]) : null);

  const parts: string[] = [];
  if (action === "PAYMENT_CREATED" || action === "PAYMENT_VOIDED") {
    const r = pick("receipt_number");
    if (r) parts.push(r);
    const t = pick("total_amount");
    if (t) parts.push(`₱${Number(t).toFixed(2)}`);
    const reason = pick("void_reason");
    if (reason) parts.push(`reason: ${reason}`);
  } else if (action === "FEES_ASSESSED") {
    parts.push(`${pick("created") ?? 0} created, ${pick("skipped") ?? 0} skipped`);
  } else if (action === "IMPORT_COMMITTED") {
    parts.push(
      `${pick("created_students") ?? 0} created, ${pick("matched_students") ?? 0} matched`,
    );
  } else {
    for (const [k, v] of Object.entries(values).slice(0, 3)) {
      if (v != null && typeof v !== "object") parts.push(`${k}: ${v}`);
    }
  }

  return parts.join(" · ") || "—";
}
