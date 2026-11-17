"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * The thin bar across the top of the window while a page is loading.
 *
 * The App Router has no global "navigation started" event, so this watches
 * clicks instead: a plain left-click on a same-origin link to a different URL
 * starts the bar, and the URL actually changing (pathname or query) finishes
 * it. That covers the cases loading.tsx cannot — a query-only change such as a
 * `?tab=` or a report filter re-renders the same segment, so no skeleton shows
 * for it, and on a slow connection the skeleton itself may not be prefetched
 * yet when the click lands.
 *
 * The listener is on `document` in the CAPTURE phase on purpose: next/link
 * calls preventDefault() in its own handler, so by the bubble phase every
 * client-side navigation looks like a cancelled click.
 *
 * Nothing is announced to assistive tech here; the page's loading skeleton
 * carries role="status" and says "Loading…" itself.
 */

/** Below this a navigation was effectively instant (a prefetched route), and
 *  flashing a bar for it reads as jitter rather than feedback. */
const SHOW_DELAY_MS = 120;
/** A link that started a bar but never navigated (an onClick that cancelled
 *  it, a redirect back to the same URL) must not leave it stuck on screen. */
const GIVE_UP_MS = 15_000;

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const url = `${pathname}?${searchParams.toString()}`;

  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  // Set up once by the effect below; the URL effect calls it to finish.
  const finish = useRef<() => void>(() => {});

  useEffect(() => {
    let active = false;
    let timers: number[] = [];
    let trickle: number | null = null;

    const clearTimers = () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers = [];
      if (trickle !== null) window.clearInterval(trickle);
      trickle = null;
    };
    const later = (fn: () => void, ms: number) => {
      timers.push(window.setTimeout(fn, ms));
    };

    const done = () => {
      if (!active) return;
      active = false;
      clearTimers();
      setProgress(100);
      later(() => setVisible(false), 200);
      later(() => setProgress(0), 450);
    };
    finish.current = done;

    const start = () => {
      clearTimers();
      active = true;
      setProgress(0);
      later(() => {
        if (!active) return;
        setVisible(true);
        setProgress(12);
        // Ease towards 90% and wait there: the bar must never claim the page
        // has arrived before it has.
        trickle = window.setInterval(() => {
          setProgress((p) => (p >= 90 ? p : p + (90 - p) * 0.1));
        }, 250);
      }, SHOW_DELAY_MS);
      later(done, GIVE_UP_MS);
    };

    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const anchor = (e.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const next = new URL(anchor.href, window.location.href);
      if (next.origin !== window.location.origin) return;
      // Same page and query: either nothing happens or only the hash moves.
      if (
        next.pathname === window.location.pathname &&
        next.search === window.location.search
      ) {
        return;
      }
      start();
    };

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clearTimers();
    };
  }, []);

  // The URL changed: the new page has committed.
  useEffect(() => {
    finish.current();
  }, [url]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 200ms ease" }}
    >
      <div
        className="h-full bg-primary shadow-[0_0_10px_var(--color-primary),0_0_4px_var(--color-primary)] motion-reduce:transition-none"
        style={{
          width: `${progress}%`,
          transition: progress === 0 ? "none" : "width 250ms ease-out",
        }}
      />
    </div>
  );
}
