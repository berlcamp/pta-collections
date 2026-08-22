import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/layout/theme-provider";
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

export const metadata: Metadata = {
  title: "PTA Collection System",
  description:
    "Multi-tenant PTA dues, penalties, collections and financial reporting.",
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
