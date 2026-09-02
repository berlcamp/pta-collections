import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/common/page-header";
import { InvitesTable } from "@/components/tables/users-table";
import { SchoolMembersTable } from "@/components/tables/schools-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/utils/dates";
import { InviteAdminDialog } from "@/components/admin/invite-admin-dialog";
import { SchoolActiveToggle } from "@/components/admin/school-active-toggle";
import { EnterSchoolButton } from "@/components/admin/enter-school-button";
import {
  SchoolSetupChecklist,
  type SetupCheck,
} from "@/components/admin/school-setup-checklist";
import type { School, SchoolRole } from "@/types/database.types";

export const dynamic = "force-dynamic";

export default async function SchoolDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSuperAdmin();
  const { id } = await params;
  const supabase = await createClient();

  const { data: school } = await supabase
    .from("schools")
    .select("*")
    .eq("id", id)
    .maybeSingle<School>();

  if (!school) notFound();

  // Counts only — head:true asks PostgREST for the count and no rows, so the
  // checklist costs a handful of index lookups rather than a page of data.
  const count = (table: string, filters: Record<string, string> = {}) => {
    let q = supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("school_id", id);
    for (const [col, value] of Object.entries(filters)) q = q.eq(col, value);
    return q;
  };

  const [
    membersRes,
    invitesRes,
    yearsRes,
    sectionsRes,
    feeTypesRes,
    enrollmentsRes,
    devicesRes,
    notifyRes,
    settingsRes,
    cardsRes,
  ] = await Promise.all([
    supabase
      .from("school_users")
      .select("id, role, status, created_at, profile:profiles(full_name, email)")
      .eq("school_id", id)
      .order("role"),
    supabase
      .from("school_user_invites")
      .select("*")
      .eq("school_id", id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    count("school_years", { is_active: "true" }),
    count("sections"),
    count("fee_types"),
    count("student_enrollments", { status: "enrolled" }),
    count("gate_devices"),
    supabase
      .from("gate_notify_config")
      .select("enabled")
      .eq("school_id", id)
      .maybeSingle(),
    supabase
      .from("school_settings")
      .select("key, value")
      .eq("school_id", id)
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
      const inner = (v as Record<string, unknown>).username ?? (v as Record<string, unknown>).number;
      return typeof inner === "string" && inner.trim().length > 0;
    }
    return false;
  };

  const checks: SetupCheck[] = [
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
    },
    {
      label: "Fee types",
      done: (feeTypesRes.count ?? 0) > 0,
      detail: "Nothing can be assessed or collected until the school's dues are defined.",
      href: "/charges/fees",
    },
    {
      label: "Students enrolled",
      done: (enrollmentsRes.count ?? 0) > 0,
      detail: "Add them one at a time, or import the whole enrolment as a CSV.",
      href: "/students",
    },
    {
      label: "A gate reader registered",
      done: (devicesRes.count ?? 0) > 0,
      detail:
        "pta.gate_devices maps a device id to this school, and that mapping is the tenancy key — record_attendance() refuses an unregistered device outright, and the reader queues its taps on flash instead of losing them.",
      silent: true,
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
      label: "Parent cards issued",
      done: (cardsRes.count ?? 0) > 0,
      detail: "A guardian cannot reach the Parent Portal until somebody hands them a card.",
      href: `/super/parent-cards?school=${school.id}`,
      hrefLabel: "Issue",
    },
  ];

  const members = (membersRes.data ?? []) as unknown as {
    id: string;
    role: SchoolRole;
    status: string;
    created_at: string;
    profile: { full_name: string; email: string } | null;
  }[];

  const invites = (invitesRes.data ?? []) as {
    id: string;
    email: string;
    full_name: string;
    role: SchoolRole;
    expires_at: string;
  }[];

  return (
    <>
      <PageHeader
        title={school.name}
        description={`${school.school_code} · receipts ${school.receipt_prefix}-YYYY-NNNNNN`}
        actions={
          <>
            <EnterSchoolButton schoolId={school.id} />
            <SchoolActiveToggle schoolId={school.id} active={school.active} />
            <InviteAdminDialog schoolId={school.id} />
          </>
        }
      />

      {/* Above the fold, because most of what it lists fails silently — a
          school with a gap here looks perfectly healthy right up until a parent
          asks why they never got a message. */}
      <div className="mb-6">
        <SchoolSetupChecklist checks={checks} />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">School details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <Detail label="Status">
              <Badge variant={school.active ? "secondary" : "outline"}>
                {school.active ? "Active" : "Inactive"}
              </Badge>
            </Detail>
            <Detail label="Address">
              {[school.address, school.city, school.province, school.region]
                .filter(Boolean)
                .join(", ") || "—"}
            </Detail>
            <Detail label="Contact">{school.contact_number ?? "—"}</Detail>
            <Detail label="Email">{school.email ?? "—"}</Detail>
            <Detail label="Timezone">{school.timezone}</Detail>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Assigned administrators and staff</CardTitle>
          </CardHeader>
          <CardContent>
            {members.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nobody has been assigned to this school yet.
              </p>
            ) : (
              <SchoolMembersTable
                rows={members.map((m) => ({
                  id: m.id,
                  name: m.profile?.full_name ?? "—",
                  email: m.profile?.email ?? "—",
                  role_label: ROLE_LABELS[m.role],
                  status: m.status,
                }))}
              />
            )}

            <p className="mt-3 text-xs text-muted-foreground">
              A Super Admin can operate inside this school without appearing in
              this list, so it counts assigned administrators only.
            </p>
          </CardContent>
        </Card>
      </div>

      {invites.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Pending invitations</CardTitle>
          </CardHeader>
          <CardContent>
            <InvitesTable
              rows={invites.map((i) => ({
                id: i.id,
                full_name: i.full_name,
                email: i.email,
                role_label: ROLE_LABELS[i.role],
                expires: formatDate(i.expires_at),
              }))}
            />
            <p className="mt-3 text-xs text-muted-foreground">
              An invitation binds to that exact Google address. If the person
              signs in with a different one they will be refused.
            </p>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 border-b py-1 last:border-0">
      <dt className="w-24 shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}
