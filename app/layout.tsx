import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { BRAND } from "@/lib/brand/mark";
import { siteUrl } from "@/lib/brand/site";
import "./globals.css";

/**
 * Typography.
 *
 * `--font-sans` used to be declared in globals.css but never bound to an
 * actual face, so every browser fell back to its default serif — Times New
 * Roman on Windows, which is what the cashiers were seeing. Both faces are
 * self-hosted by next/font, so there is no FOUT and no external request.
 *
 * Inter for UI, JetBrains Mono for money and receipt numbers: both ship
 * genuine tabular figures, which is what keeps a column of pesos aligned.
 *
 * Neither face carries the peso sign, U+20B1 — not in `latin`, and not in
 * `latin-ext` either (measured; adding that subset only bought an extra
 * download that still resolved nothing). ₱ therefore comes from the fallback
 * chain, which is set up in globals.css — see the note on --font-mono there,
 * because getting that chain wrong is what made every ₱ collide with its digit.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

/**
 * SEO and link previews.
 *
 * This is the ROOT metadata, so it is also the landing page's — `app/page.tsx`
 * deliberately exports none, because a page-level title would be composed
 * through `title.template` and come out as "Smart Campus … · Smart Campus".
 * Every other route sets its own title and gets the suffix.
 *
 * `metadataBase` is what turns the file-convention `opengraph-image` into the
 * absolute URL Facebook, Messenger, Viber and Slack require; a relative
 * og:image is dropped silently rather than resolved against the page.
 *
 * Signed-in surfaces are kept out of the index in `app/robots.ts`, not here —
 * a school's ledger and a family's gate log have no business in a search
 * result, and the two sign-in doors are worth nothing to a stranger.
 */
const TITLE =
  "Smart Campus — RFID gate attendance and a parent portal for Philippine schools";
const DESCRIPTION =
  "An RFID reader at the school gate messages parents on Telegram the moment their child taps in. Parents read the log, see what the PTA has assessed, and pay by GCash — while the office keeps one auditable ledger.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: TITLE,
    template: `%s · ${BRAND.name}`,
  },
  description: DESCRIPTION,
  applicationName: BRAND.name,
  category: "education",
  keywords: [
    "RFID school attendance",
    "school gate attendance system",
    "Telegram attendance notification",
    "parent portal",
    "PTA collection system",
    "PTA dues",
    "school fees GCash",
    "Philippine schools",
    "student attendance monitoring",
    "KeriTech",
  ],
  authors: [{ name: BRAND.vendor }],
  creator: BRAND.vendor,
  publisher: BRAND.vendor,
  alternates: { canonical: "/" },
  formatDetection: { telephone: false, address: false, email: false },
  openGraph: {
    type: "website",
    siteName: BRAND.name,
    locale: "en_PH",
    url: "/",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-svh bg-background font-sans antialiased">
        <ThemeProvider>
          <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
