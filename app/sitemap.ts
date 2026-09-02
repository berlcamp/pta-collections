import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/brand/site";

/**
 * One entry, and that is correct: every other route is a signed-in surface.
 * The file exists so the robots.txt `Sitemap:` line resolves rather than 404s.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${siteUrl()}/`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
