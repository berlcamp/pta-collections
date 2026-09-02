import { ImageResponse } from "next/og";

import { BRAND, RFID_MARK_PATHS } from "@/lib/brand/mark";

/**
 * The home-screen icon. Same glyph as `app/icon.tsx`, but iOS applies its own
 * mask and gloss to a square, so this one is drawn edge to edge with no radius
 * of its own — a rounded tile inside iOS's rounding reads as a sticker.
 */

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
        }}
      >
        <svg
          width="118"
          height="118"
          viewBox="0 0 24 24"
          fill="none"
          stroke={BRAND.white}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ marginLeft: 16 }}
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
