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

  const [membersRes, invitesRes] = await Promise.all([
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
  ]);

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
