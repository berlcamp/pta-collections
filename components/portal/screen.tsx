import type { Route } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * One portal screen: a blue hero on top, a pale sheet sliding up over it.
 *
 * There is no tab bar. The portal has two jobs — pay, and connect Telegram —
 * and everything else hangs off one of them, so every screen below home has a
 * back arrow in the top-left that goes to its PARENT route (a Link, not
 * history.back(): a parent who arrived from a Telegram message has no history
 * to go back to, and the arrow must still go somewhere sensible).
 *
 * On a phone this is the whole viewport. On a laptop the entire page is the
 * blue gradient, the hero sits straight on it, and the sheet becomes a wide
 * rounded panel — the same app, given room. Pages lay their cards out two-up
 * from `md` where that reads better than one long column.
 */
export function PortalScreen({
  hero,
  children,
}: {
  hero: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="portal-page min-h-svh">
      <div className="mx-auto flex min-h-svh w-full max-w-md flex-col md:min-h-0 md:max-w-5xl md:px-8 md:pb-12 md:pt-6">
        <header className="portal-gradient portal-hero px-5 pb-12 pt-[max(env(safe-area-inset-top),0.75rem)] text-white md:px-2 md:pb-8">
          {hero}
        </header>
        <main className="portal-sheet relative -mt-7 flex-1 rounded-t-[1.75rem] px-4 pb-[max(env(safe-area-inset-bottom),2.5rem)] pt-5 md:mt-0 md:flex-none md:rounded-[2rem] md:p-8 md:shadow-2xl md:shadow-blue-950/30">
          <div className="portal-in space-y-4">{children}</div>
        </main>
      </div>
    </div>
  );
}

/** The top row of a screen below home: back arrow, title, optional action. */
export function PortalTopBar({
  backHref,
  backLabel,
  title,
  action,
}: {
  backHref: Route;
  backLabel: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-14 items-center gap-1">
      <Link
        href={backHref}
        aria-label={backLabel}
        className="-ml-2.5 grid size-11 shrink-0 place-items-center rounded-full transition-colors hover:bg-white/10 active:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <ChevronLeft className="size-7" strokeWidth={2.25} />
      </Link>
      <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</h1>
      {action}
    </div>
  );
}

/** A heading over a group of cards on the sheet. */
export function SectionTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2 className={cn("px-1 pt-2 text-sm font-semibold text-slate-500", className)}>
      {children}
    </h2>
  );
}

/** The empty state: a soft icon and one sentence. */
export function EmptyState({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl bg-white px-6 py-10 text-center ring-1 ring-slate-900/5">
      <div className="grid size-14 place-items-center rounded-2xl bg-blue-50 text-blue-600">
        <Icon className="size-7" />
      </div>
      <p className="max-w-xs text-[0.95rem] text-slate-600">{children}</p>
    </div>
  );
}

/** Initials for an avatar. Names here are often "Surname, Given". */
export function initials(name: string): string {
  const [surname, given] = name.includes(",")
    ? name.split(",").map((part) => part.trim())
    : [name.split(/\s+/).slice(-1)[0] ?? "", name.split(/\s+/)[0] ?? ""];
  return `${given?.[0] ?? ""}${surname?.[0] ?? ""}`.toUpperCase() || "?";
}

/** The given name alone, for "Welcome back, Maria". */
export function givenName(name: string): string {
  const given = name.includes(",") ? name.split(",")[1] ?? name : name;
  return given.trim().split(/\s+/)[0] ?? name;
}
