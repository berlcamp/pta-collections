import { ImageResponse } from "next/og";

import { BRAND, RFID_MARK_PATHS } from "@/lib/brand/mark";

/**
 * The browser-tab icon: the contactless arcs on the brand blue, generated
 * rather than shipped as a binary so it stays in step with `lib/brand/mark.ts`.
 *
 * The arcs are left-anchored on their 24×24 viewBox (they radiate away from a
 * card that is not drawn), so the glyph is nudged right to sit optically
 * centred in the tile instead of mathematically centred and looking adrift.
 */

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BRAND.accent,
          borderRadius: 7,
        }}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke={BRAND.white}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ marginLeft: 3 }}
        >
          {RFID_MARK_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>
      </div>
    ),
    { ...size },
  );
}
