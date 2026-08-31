import Link from "next/link";
import { GraduationCap } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="grain relative overflow-hidden border-t border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div
        aria-hidden
        className="ledger-columns pointer-events-none absolute inset-0 text-sidebar-foreground opacity-40"
      />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <GraduationCap className="size-5" />
            </span>
            <span className="text-sm font-semibold tracking-tight">
              PTA Collection System
            </span>
          </div>
          <p className="mt-4 max-w-xs text-sm text-pretty text-sidebar-foreground/60">
            Dues, penalties, receipts and reporting for Philippine parent-teacher
            associations. One school, one ledger.
          </p>
        </div>

        <nav className="text-sm">
          <p className="font-mono text-[0.7rem] tracking-widest text-sidebar-foreground/45 uppercase">
            Product
          </p>
          <ul className="mt-3 space-y-2 text-sidebar-foreground/70">
            {[
              { href: "#modules", label: "Modules" },
              { href: "#how", label: "How it works" },
              { href: "#roles", label: "Roles" },
              { href: "#trust", label: "Controls" },
            ].map((l) => (
              <li key={l.href}>
                <a href={l.href} className="transition-colors hover:text-sidebar-foreground">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <nav className="text-sm">
          <p className="font-mono text-[0.7rem] tracking-widest text-sidebar-foreground/45 uppercase">
            Access
          </p>
          <ul className="mt-3 space-y-2 text-sidebar-foreground/70">
            <li>
              <Link href="/login" className="transition-colors hover:text-sidebar-foreground">
                School sign in
              </Link>
            </li>
            <li className="text-sidebar-foreground/50">
              Invitation only &mdash; ask your school administrator.
            </li>
            <li className="pt-2">
              <Link
                href="/portal/login"
                className="transition-colors hover:text-sidebar-foreground"
              >
                Parent sign in
              </Link>
            </li>
            <li className="text-sidebar-foreground/50">
              Use the number on your PTA parent card.
            </li>
          </ul>
        </nav>
      </div>

      <div className="relative border-t border-sidebar-border/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-5 font-mono text-xs text-sidebar-foreground/45 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>&copy; {new Date().getFullYear()} PTA Collection System</p>
          <p>Figures shown on this page are illustrative.</p>
        </div>
      </div>
    </footer>
  );
}
