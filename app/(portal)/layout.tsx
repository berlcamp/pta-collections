import type { Metadata, Viewport } from "next";

/**
 * The portal shell.
 *
 * Deliberately NOT the app shell. Parents get no sidebar, no school switcher,
 * no breadcrumb rail and no tab bar — those exist to help staff move between
 * modules, and a parent has two jobs: pay, and connect Telegram. Each screen
 * draws its own blue hero (components/portal/screen.tsx); this only paints
 * what sits behind the phone-width column on a laptop.
 */
export const metadata: Metadata = {
  title: "Parent Portal",
  // A parent's balance and their child's gate log are nobody's search result.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  // The phone's own status bar and browser chrome pick this up, so the blue
  // hero runs to the top edge instead of stopping under a white strip.
  themeColor: "#071d4f",
  viewportFit: "cover",
};

export default function PortalRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="portal-sheet min-h-svh text-slate-900 md:bg-slate-200">
      {children}
    </div>
  );
}
