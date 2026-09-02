/**
 * The site's own absolute URL.
 *
 * `metadataBase`, the sitemap and the robots file all need one, and every
 * Open Graph consumer needs the image URL to be absolute — a relative og:image
 * is silently dropped by Facebook and Slack rather than resolved.
 *
 * Set NEXT_PUBLIC_SITE_URL in production. The Vercel fallbacks keep preview
 * deployments sharing something truthful rather than localhost; the last
 * fallback is only ever hit by `next dev`.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  // VERCEL_PROJECT_PRODUCTION_URL is the stable production domain; VERCEL_URL
  // is the per-deployment one, which is right for a preview and wrong for prod.
  const vercel =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}
