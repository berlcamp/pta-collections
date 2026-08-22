import Link from "next/link";
import { Fraunces } from "next/font/google";
import {
  ArrowRight,
  Banknote,
  BookUser,
  ClipboardList,
  Clock,
  FileBarChart,
  FileSpreadsheet,
  GraduationCap,
  Eye,
  LayoutDashboard,
  Lock,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { LedgerPreview } from "@/components/marketing/ledger-preview";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/auth/permissions";

/**
 * The display face is declared here rather than in the root layout on purpose:
 * next/font only preloads a face on the routes that reference it, so the
 * authenticated app never pays for a serif it does not use.
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["SOFT", "WONK", "opsz"],
});

export const metadata = {
  title: "PTA Collection System — dues, receipts and reporting for Philippine schools",
  description:
    "Assess annual PTA dues, record cashier payments, print receipts and close the year-end report. Multi-tenant, invitation-only, and auditable down to the peso.",
};

const MODULES = [
  {
    icon: LayoutDashboard,
    title: "Dashboard",
    body: "Collected today, collected this school year, and what is still outstanding — the three numbers a PTA officer is asked for first.",
  },
  {
    icon: GraduationCap,
    title: "Students",
    body: "The roster by grade level and section. Add a learner one at a time, or import the whole enrolment as a CSV before the first day.",
  },
  {
    icon: Wallet,
    title: "Collections",
    body: "Record a payment, print the receipt, and see the day's takings per cashier. Voids are recorded, never erased.",
  },
  {
    icon: ClipboardList,
    title: "Charges",
    body: "Fee types, one-pass annual assessment for every enrolled student, individual penalties, and a live outstanding-dues list.",
  },
  {
    icon: FileBarChart,
    title: "Reports",
    body: "Collections by date, by fee type and by cashier — plus the annual PTA report, ready to print or export.",
  },
  {
    icon: Settings,
    title: "Administration",
    body: "School years, sections, invited users and their roles, and an audit log of every consequential action.",
  },
] as const;

const STEPS = [
  {
    n: "01",
    icon: Settings,
    title: "Open the school year",
    body: "Set the active year, list your sections, and define the fee types the PTA will collect — annual dues, and whatever else your assembly approved.",
  },
  {
    n: "02",
    icon: BookUser,
    title: "Bring in the roster",
    body: "Import the enrolment as a CSV, or add learners individually. Students carry their grade level and section, so every later report groups correctly.",
  },
  {
    n: "03",
    icon: Banknote,
    title: "Assess, then collect",
    body: "Assess the annual dues across all enrolled students in a single pass. From then on cashiers record payments and hand over a printed receipt.",
  },
  {
    n: "04",
    icon: ScrollText,
    title: "Close the day, close the year",
    body: "Daily totals reconcile against the cash drawer. At year end, the annual PTA report comes out of the same ledger the cashiers filled.",
  },
] as const;

const CONTROLS = [
  {
    icon: Lock,
    title: "Invitation only",
    body: "Sign-in is Google, and only for accounts a school administrator has invited. There are no passwords to leak, share or reset.",
  },
  {
    icon: ShieldCheck,
    title: "Isolated per school",
    body: "Every read is bound by row-level security. A cashier's query cannot return another school's students, payments or reports — the database refuses, not the UI.",
  },
  {
    icon: Banknote,
    title: "Money is written by the database",
    body: "Payments and voids go through audited stored procedures. Application code cannot insert a peso on its own.",
  },
  {
    icon: FileSpreadsheet,
    title: "Balances are derived",
    body: "There is no stored paid/unpaid flag to drift out of step. A balance is always computed from the charges and the payments behind it.",
  },
  {
    icon: Clock,
    title: "One clock: Asia/Manila",
    body: "Day boundaries are computed in the database in Philippine time, so a tablet with the wrong timezone can never shift a day's total.",
  },
  {
    icon: Receipt,
    title: "Nothing disappears quietly",
    body: "Who recorded a payment, who voided one, and when — all of it lands in an audit log the treasurer can read.",
  },
] as const;

/** One icon per role, so the four rows are told apart at a glance and not
 *  only by reading. Keyed to `ROLE_LABELS`, which is the source of the list. */
const ROLE_ICONS = {
  admin: ShieldCheck,
  cashier: Banknote,
  treasurer: FileBarChart,
  viewer: Eye,
} as const;

const FACTS = [
  { value: "Asia/Manila", label: "Day close computed in SQL" },
  { value: "4 roles", label: "Admin, treasurer, cashier, viewer" },
  { value: "Row-level", label: "Isolation between schools" },
  { value: "Full trail", label: "Every void is on the record" },
] as const;

export default function LandingPage() {
  return (
    <div className={`${fraunces.variable} flex min-h-svh flex-col`}>
      <SiteHeader />

      <main className="flex-1">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="grain relative overflow-hidden bg-sidebar text-sidebar-foreground">
          <div
            aria-hidden
            className="ledger-rules pointer-events-none absolute inset-0 text-sidebar-foreground opacity-70"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_38rem_at_78%_-10%,color-mix(in_oklch,var(--sidebar-primary)_38%,transparent),transparent)]"
          />

          <div className="relative mx-auto grid max-w-6xl gap-14 px-5 pt-16 pb-20 sm:px-8 sm:pt-24 sm:pb-28 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16 lg:pb-40">
            <div>
              <p
                className="rise inline-flex items-center gap-2 rounded-full border border-sidebar-border bg-sidebar-accent/60 px-3 py-1.5 font-mono text-[0.7rem] tracking-widest text-sidebar-foreground/75 uppercase"
                style={{ animationDelay: "60ms" }}
              >
                <span className="size-1.5 rounded-full bg-sidebar-primary" />
                For parent-teacher associations
              </p>

              <h1
                className="display-serif rise mt-6 text-4xl leading-[1.05] font-semibold text-balance sm:text-5xl lg:text-6xl"
                style={{ animationDelay: "140ms" }}
              >
                Every peso the PTA collects,{" "}
                <span className="text-sidebar-primary italic">on the record.</span>
              </h1>

              <p
                className="rise mt-6 max-w-xl text-lg text-pretty text-sidebar-foreground/70"
                style={{ animationDelay: "220ms" }}
              >
                Assess annual dues across the whole enrolment, let cashiers record
                payments and print receipts, and close the year with a report that
                reconciles — because it was built from the same ledger all along.
              </p>

              <div
                className="rise mt-9 flex flex-wrap items-center gap-3"
                style={{ animationDelay: "300ms" }}
              >
                <Button
                  asChild
                  size="lg"
                  className="bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/85"
                >
                  <Link href="/login">
                    Sign in to your school
                    <ArrowRight data-icon="inline-end" className="size-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="ghost"
                  className="border border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground dark:hover:bg-sidebar-accent"
                >
                  <a href="#how">See how it works</a>
                </Button>
              </div>

              <p
                className="rise mt-5 text-sm text-sidebar-foreground/50"
                style={{ animationDelay: "360ms" }}
              >
                Access is by invitation. Your school administrator sends it; there
                are no passwords.
              </p>
            </div>

            <div className="rise lg:pl-4" style={{ animationDelay: "420ms" }}>
              <LedgerPreview />
            </div>
          </div>

          {/* Fact strip */}
          <div className="relative border-t border-sidebar-border/70">
            <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-px px-5 sm:px-8 lg:grid-cols-4">
              {FACTS.map((f) => (
                <div key={f.value} className="py-6 lg:px-6 lg:first:pl-0">
                  <dt className="display-serif text-xl font-semibold text-sidebar-foreground">
                    {f.value}
                  </dt>
                  <dd className="mt-1 text-sm text-sidebar-foreground/55">
                    {f.label}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ── The problem ──────────────────────────────────────────────── */}
        <section className="border-b border-border bg-background">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
            <div className="grid gap-10 lg:grid-cols-[0.85fr_1fr] lg:gap-16">
              <div>
                <p className="font-mono text-[0.7rem] tracking-widest text-muted-foreground uppercase">
                  The Monday problem
                </p>
                <h2 className="display-serif mt-4 text-3xl font-semibold text-balance sm:text-4xl">
                  A notebook, three spreadsheets and a shoebox of receipts.
                </h2>
              </div>
              <div className="space-y-5 text-lg text-pretty text-muted-foreground">
                <p>
                  Most PTAs collect honestly and account for it badly. The dues are
                  written in a logbook, the outstanding list lives in someone&apos;s
                  spreadsheet, and the receipts are on carbon paper in a drawer. Come
                  the general assembly, three sources disagree and nobody can say
                  which one is right.
                </p>
                <p className="text-foreground">
                  This system replaces all three with one ledger. Payments are
                  recorded once, receipts are printed from that record, outstanding
                  balances are calculated from it rather than tracked beside it, and
                  the annual report is simply that ledger, totalled.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Modules ──────────────────────────────────────────────────── */}
        <section id="modules" className="scroll-mt-20 border-b border-border bg-muted/40">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
            <div className="max-w-2xl">
              <p className="font-mono text-[0.7rem] tracking-widest text-muted-foreground uppercase">
                Modules
              </p>
              <h2 className="display-serif mt-4 text-3xl font-semibold text-balance sm:text-4xl">
                Six screens, and nothing you have to be trained on.
              </h2>
              <p className="mt-4 text-lg text-pretty text-muted-foreground">
                A cashier only ever needs one of them. A treasurer lives in three.
                Everything else stays out of the way until it is someone&apos;s job.
              </p>
            </div>

            <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
              {MODULES.map(({ icon: Icon, title, body }) => (
                <article
                  key={title}
                  className="group bg-card p-7 transition-colors hover:bg-accent/40"
                >
                  <span className="grid size-11 place-items-center rounded-xl border border-primary/15 bg-primary/10 text-primary transition-transform group-hover:-translate-y-0.5">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="display-serif mt-5 text-xl font-semibold">
                    {title}
                  </h3>
                  <p className="mt-2.5 text-sm text-pretty text-muted-foreground">
                    {body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────────── */}
        <section id="how" className="scroll-mt-20 border-b border-border bg-background">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
            <div className="max-w-2xl">
              <p className="font-mono text-[0.7rem] tracking-widest text-muted-foreground uppercase">
                How it works
              </p>
              <h2 className="display-serif mt-4 text-3xl font-semibold text-balance sm:text-4xl">
                From an empty school year to a signed annual report.
              </h2>
            </div>

            {/* The rule down the left is the spine of the sequence — it is what
                makes four cards read as four steps. */}
            <ol className="mt-12 grid gap-px bg-border md:grid-cols-2">
              {STEPS.map(({ n, icon: Icon, title, body }) => (
                <li key={n} className="relative bg-background p-7 sm:p-9">
                  <div className="flex items-baseline gap-4">
                    <span className="font-mono text-sm font-medium text-primary tabular-nums">
                      {n}
                    </span>
                    <span className="h-px flex-1 bg-border" />
                    <Icon className="size-4 self-center text-muted-foreground" />
                  </div>
                  <h3 className="display-serif mt-5 text-2xl font-semibold text-balance">
                    {title}
                  </h3>
                  <p className="mt-3 text-pretty text-muted-foreground">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Roles ────────────────────────────────────────────────────── */}
        <section id="roles" className="scroll-mt-20 border-b border-border bg-muted/40">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
            <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
              <div>
                <p className="font-mono text-[0.7rem] tracking-widest text-muted-foreground uppercase">
                  Roles
                </p>
                <h2 className="display-serif mt-4 text-3xl font-semibold text-balance sm:text-4xl">
                  The person who takes the money is not the person who voids it.
                </h2>
                <p className="mt-4 text-lg text-pretty text-muted-foreground">
                  Separation of duties is the whole point of a PTA&apos;s books.
                  Four roles, assigned per school, enforced on the server on every
                  single request — not merely hidden from the menu.
                </p>
              </div>

              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                {(
                  Object.keys(ROLE_LABELS) as (keyof typeof ROLE_LABELS)[]
                ).map((role) => {
                  const Icon = ROLE_ICONS[role];
                  return (
                  <li key={role} className="flex gap-4 p-6">
                    <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-4" />
                    </span>
                    <div>
                      <h3 className="text-base font-semibold tracking-tight">
                        {ROLE_LABELS[role]}
                      </h3>
                      <p className="mt-1 text-sm text-pretty text-muted-foreground">
                        {ROLE_DESCRIPTIONS[role]}
                      </p>
                    </div>
                  </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>

        {/* ── Controls ─────────────────────────────────────────────────── */}
        <section
          id="trust"
          className="grain relative scroll-mt-20 overflow-hidden bg-sidebar text-sidebar-foreground"
        >
          <div
            aria-hidden
            className="ledger-columns pointer-events-none absolute inset-0 text-sidebar-foreground opacity-50"
          />
          <div className="relative mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
            <div className="max-w-2xl">
              <p className="font-mono text-[0.7rem] tracking-widest text-sidebar-foreground/50 uppercase">
                Controls
              </p>
              <h2 className="display-serif mt-4 text-3xl font-semibold text-balance sm:text-4xl">
                Built so that trusting it is not a leap of faith.
              </h2>
              <p className="mt-4 text-lg text-pretty text-sidebar-foreground/65">
                Parents&apos; money deserves controls that hold even when someone
                is careless — or curious. These are enforced in the database, below
                the application, where a bug in a screen cannot get around them.
              </p>
            </div>

            <div className="mt-12 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
              {CONTROLS.map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="border-t border-sidebar-border/70 pt-6"
                >
                  <span className="grid size-10 place-items-center rounded-lg bg-sidebar-accent text-sidebar-primary">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-4 text-base font-semibold tracking-tight">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm text-pretty text-sidebar-foreground/60">
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Sign in ──────────────────────────────────────────────────── */}
        <section className="bg-background">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
            <div className="relative overflow-hidden rounded-3xl border border-border bg-card px-7 py-14 text-center shadow-sm sm:px-12">
              <div
                aria-hidden
                className="ledger-rules pointer-events-none absolute inset-0 text-foreground opacity-25"
              />
              <div className="relative mx-auto max-w-2xl">
                <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                  <GraduationCap className="size-7" />
                </span>
                <h2 className="display-serif mt-6 text-3xl font-semibold text-balance sm:text-4xl">
                  Already invited? Your ledger is waiting.
                </h2>
                <p className="mt-4 text-lg text-pretty text-muted-foreground">
                  Sign in with the Google account your school administrator
                  invited. If you have not been invited yet, ask them &mdash; it
                  takes about a minute from their side.
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  <Button asChild size="lg">
                    <Link href="/login">
                      Sign in
                      <ArrowRight data-icon="inline-end" className="size-4" />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline">
                    <a href="#modules">Browse the modules</a>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
