"use client";

import { usePathname } from "next/navigation";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * `attribute="class"` is what globals.css keys its `.dark` block off, and
 * `disableTransitionOnChange` stops every surface in the app cross-fading at
 * once when the theme flips.
 *
 * The dark rail is NOT part of this: the sidebar tokens are dark in both
 * themes on purpose, so switching only repaints the working area.
 *
 * The cashier desk is light only. It has to be forced here rather than in its
 * own layout because next-themes ignores a nested provider, and `dark:` variants
 * key off the class on <html>, which no wrapper element can undo.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const lightOnly = pathname === "/cashier" || pathname.startsWith("/cashier/");

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      forcedTheme={lightOnly ? "light" : undefined}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
