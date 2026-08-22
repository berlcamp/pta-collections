/**
 * Local-only email/password sign-in.
 *
 * This system has no passwords (v2 spec §6) — production is Google OAuth only.
 * This exists purely so local development does not require a Google Cloud
 * round-trip before you can see a single page.
 *
 * It is gated on BOTH conditions, so it cannot leak into a real deployment:
 *   1. NEXT_PUBLIC_ENABLE_DEV_LOGIN === "true"
 *   2. the Supabase URL points at localhost
 *
 * Condition 2 is the one that matters: even if the flag is set by accident in
 * a production build, the form will not render while pointing at the cloud
 * project. And the cloud project's own auth settings have the email provider
 * disabled regardless, so there would be nothing to sign in to.
 */
export function isDevLoginEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN !== "true") return false;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return url.includes("127.0.0.1") || url.includes("localhost");
}
