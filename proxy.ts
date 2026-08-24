import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  PTA_COOKIE_PREFIX,
  PTA_SCHEMA,
  PTA_STORAGE_KEY,
} from "@/lib/supabase/config";

const PUBLIC_PATHS = ["/login", "/auth/callback", "/no-access", "/auth/error"];

/** The marketing landing page. Kept out of PUBLIC_PATHS because the prefix
 *  test below would read "/" as a prefix of every route and open the app. */
const LANDING_PATH = "/";

/**
 * The access gate.
 *
 * Supabase WILL mint a session for any Google account that clicks through —
 * on a shared project there is no per-app way to prevent that. What this
 * guarantees instead is that an account with no `pta.profiles` row reaches
 * nothing: it is bounced to /no-access, and RLS returns zero rows besides.
 *
 * Do not "fix" the OAuth exchange with a Supabase auth hook: hooks are
 * project-wide and would break construction-saas and sms-demo.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: PTA_SCHEMA },
      auth: { storageKey: PTA_STORAGE_KEY },
      cookieOptions: { name: PTA_COOKIE_PREFIX },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refreshes the session cookie as a side effect. Must run before any redirect.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic =
    pathname === LANDING_PATH ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!user) {
    if (isPublic) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Signed in. Are they provisioned in `pta`?
  let { data: profile } = await supabase
    .from("profiles")
    .select("id, global_role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!profile) {
    // Lazy provisioning (D5): try to claim an invitation for this email.
    // This is also how the super-admin bootstrap row gets bound on first login,
    // and how an invitee who already existed in auth.users (because they use
    // another app on this shared project) gets in — a case an AFTER INSERT
    // trigger on auth.users structurally cannot handle.
    await supabase.rpc("claim_invite");

    ({ data: profile } = await supabase
      .from("profiles")
      .select("id, global_role")
      .eq("auth_user_id", user.id)
      .maybeSingle());

    if (!profile) {
      if (pathname === "/no-access") return response;
      const url = request.nextUrl.clone();
      url.pathname = "/no-access";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  const toDashboard = () => {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  };

  // Holding a profile is not the same as having a way in.
  //
  // /dashboard needs an ACTIVE school and sends a member-less non-super-admin
  // to /no-access. If this file bounced everyone holding a profile straight
  // back to /dashboard, those two rules would chase each other forever and the
  // browser would give up with ERR_TOO_MANY_REDIRECTS. So someone only leaves
  // /no-access when they actually have somewhere to go, decided by the same
  // predicate getSessionContext() uses: super admin, or an active membership
  // in an active school. Deactivate a cashier, or deactivate their school, and
  // they land here with an explanation instead of a broken tab.
  //
  // The membership query runs on /no-access only, so the normal request path
  // still costs exactly one profile lookup.
  if (pathname === "/no-access") {
    if (profile.global_role === "super_admin") return toDashboard();

    const { data: usable } = await supabase
      .from("school_users")
      .select("school_id, school:schools!inner(active)")
      .eq("profile_id", profile.id)
      .eq("status", "active")
      .eq("school.active", true)
      .limit(1);

    return usable && usable.length > 0 ? toDashboard() : response;
  }

  if (pathname === "/login" || pathname === "/") {
    return toDashboard();
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
