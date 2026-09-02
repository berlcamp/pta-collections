import { ImageResponse } from "next/og";

import { BRAND, RFID_MARK_PATHS } from "@/lib/brand/mark";

/**
 * The card every social platform renders when someone pastes a link to this
 * site — Facebook, Messenger, Viber, Slack, X, LinkedIn all read the same
 * `og:image`, and in a Philippine school group chat that thumbnail is the
 * whole pitch.
 *
 * It lives here rather than in the route file because `app/opengraph-image.tsx`
 * and `app/twitter-image.tsx` must both serve it and a route file cannot
 * import another route file's default export.
 *
 * SATORI CONSTRAINTS, all of them load-bearing:
 *  - flexbox only, no grid, and every element with children needs an explicit
 *    `display: flex` — a bare div with two children silently renders as one.
 *  - no CSS custom properties and no oklch, so the palette comes from
 *    `lib/brand/mark.ts` as hex.
 *  - no external font fetch here on purpose: a build that reaches the network
 *    to draw a thumbnail is a build that fails offline.
 */

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt =
  "Smart Campus by KeriTech — gate attendance with Telegram alerts and a parent portal";

function Mark({ px, stroke }: { px: number; stroke: number }) {
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      stroke={BRAND.white}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ marginLeft: px * 0.1 }}
    >
      {RFID_MARK_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export function renderOgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "62px 72px",
          background: `linear-gradient(135deg, ${BRAND.ground} 0%, ${BRAND.ground} 45%, #1c2a45 100%)`,
          color: BRAND.white,
        }}
      >
        {/* ── Lockup ─────────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 76,
                height: 76,
                borderRadius: 20,
                background: BRAND.accent,
              }}
            >
              <Mark px={44} stroke={2.3} />
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  display: "flex",
                  fontSize: 38,
                  fontWeight: 700,
                  letterSpacing: -0.5,
                }}
              >
                {BRAND.name}
              </div>
              {/* One interpolation, not `by {BRAND.vendor}`: that is two child
                  nodes, and Satori refuses any element with more than one
                  child unless it declares a display. */}
              <div
                style={{
                  display: "flex",
                  fontSize: 22,
                  color: BRAND.ink,
                  opacity: 0.6,
                }}
              >
                {`by ${BRAND.vendor}`}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "12px 24px",
              borderRadius: 999,
              border: `1px solid ${BRAND.line}`,
              background: BRAND.surface,
              color: BRAND.ink,
              fontSize: 20,
              letterSpacing: 1.5,
            }}
          >
            RFID SCHOOL GATE
          </div>
        </div>

        {/* ── The promise ────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 74,
              fontWeight: 700,
              letterSpacing: -2,
              lineHeight: 1.08,
            }}
          >
            Your child reaches school.
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 74,
              fontWeight: 700,
              letterSpacing: -2,
              lineHeight: 1.08,
              color: BRAND.accent,
            }}
          >
            Your phone says so.
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 22,
              fontSize: 27,
              color: BRAND.ink,
              opacity: 0.75,
            }}
          >
            Telegram alerts at the gate · Parent portal · PTA fees by GCash
          </div>
        </div>

        {/* ── The message itself, because the product IS the message ─── */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              padding: "20px 28px",
              borderRadius: 18,
              background: BRAND.white,
              color: "#131922",
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 24,
                color: "#626a75",
              }}
            >
              07:04
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 25, fontWeight: 600 }}>
                Dela Cruz, Ana M.
              </div>
              <div style={{ display: "flex", fontSize: 20, color: "#626a75" }}>
                Grade 7 — Rizal
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "8px 18px",
                marginLeft: 12,
                borderRadius: 999,
                background: "#e6f6ec",
                color: "#1c7a4c",
                fontSize: 20,
                fontWeight: 600,
                letterSpacing: 1,
              }}
            >
              TAPPED IN
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "20px 28px",
              borderRadius: 18,
              border: `1px solid ${BRAND.line}`,
              background: BRAND.surface,
              color: BRAND.ink,
              fontSize: 24,
            }}
          >
            → Telegram, 7:04 AM
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
