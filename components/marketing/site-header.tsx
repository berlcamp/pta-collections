import Link from "next/link";
import { IdCard, Nfc } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const SECTIONS = [
  { href: "#gate", label: "Gate attendance" },
  { href: "#parents", label: "Parent portal" },
  { href: "#collections", label: "Collections" },
  { href: "#roles", label: "Roles" },
  { href: "#trust", label: "Controls" },
] as const;

/**
 * The public header.
 *
 * It stays dark in both themes, exactly like the app's sidebar rail — a
 * visitor who signs in should recognise the same product on the other side of
 * the door. That also means it needs no scroll listener to stay legible over
 * the light bands below the hero, so this can remain a server component.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-sidebar-border/70 bg-sidebar/85 text-sidebar-foreground backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
            {/* The contactless arcs, not a mortarboard: what this product does at a
                school is read a card at the gate. */}
            <Nfc className="size-5" />
          </span>
          <span className="text-sm leading-tight font-semibold tracking-tight">
            Smart Campus
            <span className="block text-xs font-normal text-sidebar-foreground/55">
              by KeriTech
            </span>
          </span>
        </Link>

        <nav className="ml-auto hidden items-center gap-1 md:flex">
          {SECTIONS.map((s) => (
            <a
              key={s.href}
              href={s.href}
              className="rounded-lg px-3 py-2 text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              {s.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 md:ml-2">
          <div className="text-sidebar-foreground/80 [&_button:hover]:bg-sidebar-accent [&_button:hover]:text-sidebar-accent-foreground">
            <ThemeToggle />
          </div>
          {/* Two doors, and the parent one is the primary button: the page it
              sits on leads with the gate alerts and the portal, and there are
              a few hundred parents to every handful of staff. Staff still get
              a door of their own, one step quieter. The labels shorten on
              small screens so both fit beside the logo. */}
          <Button
            asChild
            size="sm"
            variant="ghost"
            className="border border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground dark:hover:bg-sidebar-accent"
          >
            <Link href="/login">
              <span className="hidden sm:inline">School sign in</span>
              <span className="sm:hidden">School</span>
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            className="bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/85"
          >
            <Link href="/portal/login">
              <IdCard className="size-4" />
              <span className="hidden sm:inline">Parent sign in</span>
              <span className="sm:hidden">Parents</span>
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
