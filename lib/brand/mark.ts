/**
 * The brand mark, and the few colours the generated images need.
 *
 * WHY THE PATHS ARE COPIED HERE.
 * In the app itself the mark is lucide's `Nfc` component — the contactless
 * arcs, which is what an RFID tap looks like everywhere else in the world. But
 * `app/icon.tsx` and the Open Graph image render through Satori, which walks a
 * React tree into an SVG raster and cannot use a component that only exists to
 * spread props onto `<svg>`. So the four arcs live here as raw path data, and
 * both sides draw the same glyph. If lucide ever redraws `Nfc`, these drift —
 * they are pinned to lucide-react 1.33.0.
 *
 * WHY THE COLOURS ARE HEX.
 * `app/globals.css` states every colour in oklch, and Satori does not resolve
 * CSS custom properties or oklch. These are the same tokens, converted once:
 * change one here only when the token beside it changes.
 */

/** lucide-react 1.33.0 `Nfc`, on a 24×24 viewBox. */
export const RFID_MARK_PATHS = [
  "M6 8.32a7.43 7.43 0 0 1 0 7.36",
  "M9.46 6.21a11.76 11.76 0 0 1 0 11.58",
  "M12.91 4.1a15.91 15.91 0 0 1 .01 15.8",
  "M16.37 2a20.16 20.16 0 0 1 0 20",
] as const;

export const BRAND = {
  name: "Smart Campus",
  vendor: "KeriTech",
  /** --sidebar (light), the rail that is dark in both themes. */
  ground: "#171f2e",
  /** --sidebar, one step deeper, for the gradient's far corner. */
  groundDeep: "#111620",
  /** --sidebar-primary */
  accent: "#4385e4",
  /** --sidebar-foreground */
  ink: "#d3d8e0",
  /** --sidebar-accent */
  surface: "#273042",
  /** --sidebar-border */
  line: "#2d3645",
  /** --success (dark), the "IN" badge at the gate. */
  ok: "#3fb171",
  white: "#ffffff",
} as const;
