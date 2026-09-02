import { renderOgImage } from "@/components/brand/og-image";

/**
 * The same card as `opengraph-image.tsx`. X reads og: tags when twitter: ones
 * are missing, so this file is belt and braces — but it costs one re-export
 * and it means `twitter:image` is present for the crawlers that insist on it.
 */
export { size, contentType, alt } from "@/components/brand/og-image";

export default function TwitterImage() {
  return renderOgImage();
}
