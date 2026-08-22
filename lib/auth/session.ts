import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, School, SchoolRole, SchoolUser } from "@/types/database.types";

export const ACTIVE_SCHOOL_COOKIE = "pta_active_school";

export interface SessionContext {
  profile: Profile;
  isSuperAdmin: boolean;
  /** Active memberships, joined to their school. */
  memberships: (SchoolUser & { school: School })[];
  /** The school currently being operated in, or null for the global context. */
  activeSchool: School | null;
  /**
   * The caller's effective role inside activeSchool. A super admin without an
   * explicit membership is treated as 'admin' (D2) — the switcher is a scoping
   * filter, and accountability comes from the audit log.
   */
  activeRole: SchoolRole | null;
  /** True when a super admin is operating inside a school with no membership. */
  actingAsSuperAdmin: boolean;
}

/**
 * Resolve the signed-in user's full context.
 *
 * Returns null when there is no session, or when the session has no `pta`
 * profile — i.e. an uninvited Google account. Callers redirect; they never
 * fall through to rendering data.
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle<Profile>();

  if (!profile) return null;

  const isSuperAdmin = profile.global_role === "super_admin";

  const { data: rawMemberships } = await supabase
    .from("school_users")
    .select("*, school:schools(*)")
    .eq("profile_id", profile.id)
    .eq("status", "active");

  const memberships = ((rawMemberships ?? []) as (SchoolUser & { school: School })[])
    .filter((m) => m.school?.active);

  const cookieStore = await cookies();
  const requested = cookieStore.get(ACTIVE_SCHOOL_COOKIE)?.value ?? null;

  let activeSchool: School | null = null;

  if (isSuperAdmin) {
    // A super admin may select any active school. No selection = global context,
    // never an arbitrary school's data.
    if (requested) {
      const { data } = await supabase
        .from("schools")
        .select("*")
        .eq("id", requested)
        .eq("active", true)
        .maybeSingle<School>();
      activeSchool = data ?? null;
    }
  } else {
    // A normal user may only ever be in a school they hold a membership in.
    // The cookie is authorization-checked here on every request; RLS enforces
    // it again underneath.
    const match = requested
      ? memberships.find((m) => m.school_id === requested)
      : undefined;
    activeSchool = match?.school ?? memberships[0]?.school ?? null;
  }

  const membership = activeSchool
    ? memberships.find((m) => m.school_id === activeSchool!.id)
    : undefined;

  const actingAsSuperAdmin = Boolean(isSuperAdmin && activeSchool && !membership);
  const activeRole: SchoolRole | null = membership
    ? membership.role
    : actingAsSuperAdmin
      ? "admin"
      : null;

  return {
    profile,
    isSuperAdmin,
    memberships,
    activeSchool,
    activeRole,
    actingAsSuperAdmin,
  };
}

/** For pages that require a signed-in, provisioned user. */
export async function requireSession(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/no-access");
  return ctx;
}

export type SchoolSession = SessionContext & {
  activeSchool: School;
  activeRole: SchoolRole;
};

/** For pages that require an active school context. */
export async function requireSchool(): Promise<SchoolSession> {
  const ctx = await requireSession();
  if (!ctx.activeSchool || !ctx.activeRole) {
    redirect(ctx.isSuperAdmin ? "/super/schools" : "/no-access");
  }
  return ctx as SchoolSession;
}

/** For pages restricted to particular school roles. */
export async function requireRole(roles: SchoolRole[]): Promise<SchoolSession> {
  const ctx = await requireSchool();
  if (!roles.includes(ctx.activeRole)) redirect("/dashboard");
  return ctx;
}

export async function requireSuperAdmin(): Promise<SessionContext> {
  const ctx = await requireSession();
  if (!ctx.isSuperAdmin) redirect("/dashboard");
  return ctx;
}
