import { Users } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { UsersTable, type MemberRow } from "@/components/tables/users-table";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { formatDate, formatDateTime } from "@/lib/utils/dates";
import { InviteUserDialog } from "@/components/admin/invite-user-dialog";
import { getActiveSchoolYear, getSections } from "@/lib/data/school";
import type { SchoolRole } from "@/types/database.types";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const ctx = await requireRole(["admin"]);
  const supabase = await createClient();

  const activeYear = await getActiveSchoolYear(ctx.activeSchool.id);
  // A teacher's sections can be chosen on the invite (0031): this year's.
  const sections = activeYear ? await getSections(ctx.activeSchool.id, activeYear.id) : [];
  const sectionOptions = sections.map((s) => ({
    id: s.id,
    name: s.name,
    grade_level: s.grade_level,
  }));

  const [membersRes, invitesRes, signInsRes] = await Promise.all([
    supabase
      .from("school_users")
      .select("id, role, status, created_at, profile:profiles!school_users_profile_id_fkey(id, full_name, email)")
      .eq("school_id", ctx.activeSchool.id)
      .order("role"),
    supabase
      .from("school_user_invites")
      .select("*")
      .eq("school_id", ctx.activeSchool.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    // auth.users is not readable here; this admin-only read returns just the
    // timestamp for this school's members (0032).
    supabase.rpc("school_member_sign_ins", { p_school_id: ctx.activeSchool.id }),
  ]);

  const signedIn = new Map(
    ((signInsRes.data ?? []) as { profile_id: string; last_sign_in_at: string | null }[]).map(
      (r) => [r.profile_id, r.last_sign_in_at],
    ),
  );

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
    created_at: string;
  }[];

  const tz = ctx.activeSchool.timezone;
  // Members and pending invitations in ONE list: an invitee is a person the
  // admin is waiting on, and belongs beside the people already in.
  const rows: MemberRow[] = [
    ...members.map((m) => {
      const at = m.profile ? (signedIn.get(m.profile.id) ?? null) : null;
      return {
        id: m.id,
        name: m.profile?.full_name ?? "—",
        email: m.profile?.email ?? "—",
        role_label: ROLE_LABELS[m.role],
        status: m.status,
        added: formatDate(m.created_at),
        last_signed_in: at ? formatDateTime(at, tz) : null,
        last_signed_in_at: at,
        isSelf: m.profile?.id === ctx.profile.id,
      };
    }),
    ...invites.map((i) => ({
      id: `invite-${i.id}`,
      name: i.full_name,
      email: i.email,
      role_label: ROLE_LABELS[i.role],
      status: "invited" as const,
      added: formatDate(i.created_at),
      last_signed_in: null,
      last_signed_in_at: null,
      isSelf: false,
    })),
  ];

  return (
    <>
      <PageHeader
        title="Users"
        description="Access is by invitation only. Deactivating someone takes effect on their next request."
        actions={<InviteUserDialog sections={sectionOptions} />}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No users yet"
          description="Invite a cashier, treasurer, viewer or teacher to this school."
          action={<InviteUserDialog sections={sectionOptions} />}
        />
      ) : (
        <UsersTable rows={rows} />
      )}

      {invites.length > 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          An invitation binds to that exact Google address. Someone invited at a
          school address who signs in with a personal Gmail will be refused —
          invite the address they actually use. Invitations expire after 30 days.
        </p>
      )}
    </>
  );
}
