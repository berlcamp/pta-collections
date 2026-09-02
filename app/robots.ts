import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/brand/site";

/**
 * Only the marketing page is worth indexing.
 *
 * Everything under the disallow list is either behind a session or is a door
 * to one: /portal is a family's gate log and fee balance, /dashboard and the
 * rest are a school's ledger, and /print renders receipts. None of it is
 * reachable without a credential, but a crawler that indexes the sign-in
 * screens puts "Smart Campus sign in" ahead of the actual page in a result.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/api/",
        "/auth/",
        "/charges/",
        "/collections/",
        "/dashboard",
        "/login",
        "/no-access",
        "/portal",
        "/print/",
        "/reports/",
        "/students/",
        "/super/",
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
