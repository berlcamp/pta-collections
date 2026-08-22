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
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!profile) {
    // Lazy provisioning (D5): try to claim an invitation for this email.
    // This is also how the super-admin bootstrap row gets bound on first login,
    // and how an invitee who already existed in auth.users (because they use
    // another app on this shared project) gets in — a case an AFTER INSERT
    // trigger on auth.users structurally cannot handle.
    await supabase.rpc("claim_invite");

    const { data: claimed } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (!claimed) {
      if (pathname === "/no-access") return response;
      const url = request.nextUrl.clone();
      url.pathname = "/no-access";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  if (pathname === "/login" || pathname === "/no-access" || pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
