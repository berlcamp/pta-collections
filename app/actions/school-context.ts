"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_SCHOOL_COOKIE, getSessionContext } from "@/lib/auth/session";

/**
 * Switch the active school.
 *
 * For a normal user this is an authorization decision and is checked against
 * their memberships. For a super admin it is a scoping choice (D2), so we only
 * verify the school exists and is active. RLS enforces the real boundary either
 * way — a tampered cookie cannot widen what Postgres will return.
 */
export async function switchSchool(schoolId: string) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/no-access");

  if (ctx.isSuperAdmin) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("schools")
      .select("id")
      .eq("id", schoolId)
      .eq("active", true)
      .maybeSingle();
    if (!data) throw new Error("That school does not exist or is inactive.");
  } else {
    const allowed = ctx.memberships.some((m) => m.school_id === schoolId);
    if (!allowed) throw new Error("You do not have access to that school.");
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_SCHOOL_COOKIE, schoolId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

/** Return a Super Admin to the global context. */
export async function exitSchool() {
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_SCHOOL_COOKIE);
  revalidatePath("/", "layout");
  redirect("/super");
}
