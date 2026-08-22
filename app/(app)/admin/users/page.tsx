import { Users } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { SectionHeader } from "@/components/common/page-header";
import { InvitesTable, UsersTable } from "@/components/tables/users-table";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/utils/dates";
import { InviteUserDialog } from "@/components/admin/invite-user-dialog";
import type { SchoolRole } from "@/types/database.types";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const ctx = await requireRole(["admin"]);
  const supabase = await createClient();

  const [membersRes, invitesRes] = await Promise.all([
    supabase
      .from("school_users")
      .select("id, role, status, created_at, profile:profiles(id, full_name, email)")
      .eq("school_id", ctx.activeSchool.id)
      .order("role"),
    supabase
      .from("school_user_invites")
      .select("*")
      .eq("school_id", ctx.activeSchool.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);

  const members = (membersRes.data ?? []) as unknown as {
    id: string;
    role: SchoolRole;
    status: "active" | "inactive";
    created_at: string;
    profile: { id: string; full_name: string; email: string } | null;
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
        title="Users"
        description="Access is by invitation only. Deactivating someone takes effect on their next request."
        actions={<InviteUserDialog />}
      />

      {members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No users yet"
          description="Invite a cashier, treasurer or viewer to this school."
          action={<InviteUserDialog />}
        />
      ) : (
        <UsersTable
          rows={members.map((m) => ({
            id: m.id,
            name: m.profile?.full_name ?? "—",
            email: m.profile?.email ?? "—",
            role_label: ROLE_LABELS[m.role],
            status: m.status,
            added: formatDate(m.created_at),
            isSelf: m.profile?.id === ctx.profile.id,
          }))}
        />
      )}

      {invites.length > 0 && (
        <div className="mt-10">
          <SectionHeader
            title="Pending invitations"
            description="An invitation binds to that exact Google address. Someone invited at a school address who signs in with a personal Gmail will be refused — invite the address they actually use."
          />
          <InvitesTable
            rows={invites.map((i) => ({
              id: i.id,
              full_name: i.full_name,
              email: i.email,
              role_label: ROLE_LABELS[i.role],
              expires: formatDate(i.expires_at),
            }))}
          />
        </div>
      )}
    </>
  );
}
