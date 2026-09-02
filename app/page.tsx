import Link from "next/link";
import { Fraunces } from "next/font/google";
import {
  ArrowRight,
  Banknote,
  BellRing,
  BookUser,
  Camera,
  ClipboardList,
  Clock,
  CreditCard,
  FileBarChart,
  GraduationCap,
  HandCoins,
  IdCard,
  Eye,
  LayoutDashboard,
  Lock,
  Nfc,
  Receipt,
  ScanLine,
  Settings,
  ShieldCheck,
  Smartphone,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { GatePreview } from "@/components/marketing/gate-preview";
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

/** The gate, in the order it actually happens. */
const GATE_STEPS = [
  {
    n: "01",
    icon: ScanLine,
    title: "The card taps",
    body: "A reader at the gate reads the student's card. It knows only its own device ID; the school it belongs to is decided in the database, so a reader can never file a tap against a school it was not registered to.",
  },
  {
    n: "02",
    icon: BellRing,
    title: "The parent is messaged",
    body: "Within seconds, the guardians who asked to be notified get a Telegram message naming the child, the gate and the time. Linking is one tap; switching it off is one more.",
  },
  {
    n: "03",
    icon: Clock,
    title: "A late tap says it is late",
    body: "If the reader lost the network and flushes an hour of taps at noon, nobody is told their child has just arrived. Delayed messages are worded as delayed, and stale ones are recorded and never sent.",
  },
  {
    n: "04",
    icon: BookUser,
    title: "The log stays",
    body: "Every tap lands on the school's attendance board and in the parent's own history, dated in Philippine time by the database — not by whatever clock the tablet in the office happens to have.",
  },
] as const;

/** What the portal actually does, in the order a parent cares about it. */
const PARENT_FEATURES = [
  {
    icon: ScanLine,
    title: "Gate attendance",
    body: "Every tap in and out, day by day, for each of your children — the same record the school sees.",
  },
  {
    icon: Smartphone,
    title: "Telegram alerts",
    body: "A message the moment they arrive. One tap to switch on, and off again whenever you like.",
  },
  {
    icon: Wallet,
    title: "Fees and receipts",
    body: "What is still due, and every official receipt you have been issued, in one list.",
  },
  {
    icon: HandCoins,
    title: "Pay and give",
    body: "Send your payment by GCash and submit the reference. Support PTA projects the same way.",
  },
] as const;

const MODULES = [
  {
    icon: LayoutDashboard,
    title: "Dashboard",
    body: "Collected today, collected this school year, and what is still outstanding — the three numbers a PTA officer is asked for first.",
  },
  {
    icon: GraduationCap,
    title: "Students",
    body: "The roster by grade level and section — the same roster the gate reader resolves a card against. Add a learner at a time, or import the enrolment as a CSV.",
  },
  {
    icon: Wallet,
    title: "Collections",
    body: "Record a payment, print the receipt, and see the day's takings per cashier. A payment sent from the portal joins the same list. Voids are recorded, never erased.",
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

const CONTROLS = [
  {
    icon: Lock,
    title: "Two doors, two identities",
    body: "Staff sign in with an invited Google account. Parents sign in with the card the school printed them — and hold nothing that could reach a staff screen.",
  },
  {
    icon: Eye,
    title: "A parent sees their own children",
    body: "The filter is compiled into the portal's queries in the database, not applied by the page. A guardian cannot ask for another family's attendance, balance or receipt.",
  },
  {
    icon: ShieldCheck,
    title: "Isolated per school",
    body: "Every read is bound by row-level security. A cashier's query cannot return another school's students, payments or attendance — the database refuses, not the UI.",
  },
  {
    icon: Banknote,
    title: "Money is written by the database",
    body: "Payments and voids go through audited stored procedures. A GCash claim from the portal is money a parent says they sent — it becomes a payment only when a person has checked it.",
  },
  {
    icon: Clock,
    title: "One clock: Asia/Manila",
    body: "Attendance days and collection days are both cut in the database in Philippine time, so a device with the wrong timezone can never shift either.",
  },
  {
    icon: Receipt,
    title: "Nothing disappears quietly",
    body: "Who bound a card to a student, who took a payment, who voided one, and when — all of it lands in an audit log the treasurer can read.",
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
  { value: "Seconds", label: "From the tap to the parent's phone" },
  { value: "Telegram", label: "No app for the family to install" },
  { value: "GCash", label: "Dues paid without a trip to school" },
  { value: "Asia/Manila", label: "Every day boundary cut in SQL" },
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
                Gate attendance &amp; parent portal
              </p>

              <h1
                className="display-serif rise mt-6 text-4xl leading-[1.05] font-semibold text-balance sm:text-5xl lg:text-6xl"
                style={{ animationDelay: "140ms" }}
              >
                Your child reaches school.{" "}
                <span className="text-sidebar-primary italic">
                  Your phone says so.
                </span>
              </h1>

              <p
                className="rise mt-6 max-w-xl text-lg text-pretty text-sidebar-foreground/70"
                style={{ animationDelay: "220ms" }}
              >
                A card reader at the gate messages you on Telegram the moment
                your child taps in. In the parent portal you can read the whole
                log, see what you still owe the PTA, and settle it by GCash
                without a trip to the office.
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
                  <Link href="/portal/login">
                    Parent sign in
                    <ArrowRight data-icon="inline-end" className="size-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="ghost"
                  className="border border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground dark:hover:bg-sidebar-accent"
                >
                  <a href="#gate">See how the gate works</a>
                </Button>
              </div>

              <p
                className="rise mt-5 text-sm text-sidebar-foreground/50"
                style={{ animationDelay: "360ms" }}
              >
                Parents sign in with the number under the barcode on their PTA
                card. Nothing to install, no account to create.
              </p>

              {/* Staff arrive here too, and their door is a different one —
                  an invited Google account, not a card. */}
              <p
                className="rise mt-3 text-sm text-sidebar-foreground/70"
                style={{ animationDelay: "400ms" }}
              >
                School staff?{" "}
                <Link
                  href="/login"
                  className="font-medium text-sidebar-primary underline-offset-4 hover:underline"
                >
                  Sign in to your school
                  <ArrowRight data-icon="inline-end" className="inline size-3.5" />
                </Link>
              </p>
            </div>

            <div className="rise lg:pl-4" style={{ animationDelay: "420ms" }}>
              <GatePreview />
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
                  The 7 a.m. problem
                </p>
                <h2 className="display-serif mt-4 text-3xl font-semibold text-balance sm:text-4xl">
                  A parent waves goodbye at the corner and hears nothing until
                  dismissal.
                </h2>
              </div>
              <div className="space-y-5 text-lg text-pretty text-muted-foreground">
                <p>
                  Whether the child actually walked in at 7:04 or never arrived
                  at all is, on most days, a question nobody can answer until
                  somebody notices an empty chair. The attendance sheet is
                  called at the start of a period, copied into a logbook, and
                  read by no parent at all.
                </p>
                <p className="text-foreground">
                  A reader at the gate answers it at the gate. The tap is the
                  record, the message goes out in the same breath, and the
                  family can open the full log any time &mdash; alongside the
                  PTA balance they can now settle from the same screen.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── The gate ─────────────────────────────────────────────────── */}
        <section id="gate" className="scroll-mt-20 border-b border-border bg-muted/40">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
            <div className="max-w-2xl">
              <p className="font-mono text-[0.7rem] tracking-widest text-muted-foreground uppercase">
                Gate attendance
              </p>
              <h2 className="display-serif mt-4 text-3xl font-semibold text-balance sm:text-4xl">
                One tap, and four things happen before the child reaches the
                corridor.
              </h2>
              <p className="mt-4 text-lg text-pretty text-muted-foreground">
                The reader is a small device screwed to the wall by the gate. It
                holds no roster of its own: it resolves the card against the
                school&apos;s enrolment, so a student added in the office is
                recognised at the gate the same morning.
              </p>
            </div>

            {/* The rule down the left is the spine of the sequence — it is what
                makes four cards read as four steps. */}
            <ol className="mt-12 grid gap-px bg-border md:grid-cols-2">
              {GATE_STEPS.map(({ n, icon: Icon, title, body }) => (
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

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {[
                {
                  icon: Camera,
                  title: "A capture with the tap",
                  body: "The reader can photograph whoever presented the card. If the upload fails, the attendance row is still written — the record never waits on a picture.",
                },
                {
                  icon: CreditCard,
                  title: "Cards are bound, not swapped",
                  body: "Binding a card to a student is one audited action. Revoking it stamps a date rather than deleting, so last term's log still names whoever really held that card.",
                },
                {
                  icon: Smartphone,
                  title: "Opt-in per guardian",
                  body: "Each guardian links their own Telegram and can be switched off individually. A family with two phones can have both, or one.",
                },
              ].map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="rounded-2xl border border-border bg-card p-6 shadow-sm"
                >
                  <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-4 text-base font-semibold tracking-tight">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm text-pretty text-muted-foreground">
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Parents ──────────────────────────────────────────────────────
            The second headline act, and the one addressed to the few hundred
            people per school who will actually open this — who arrive holding
            a card rather than an invitation. */}
        <section id="parents" className="border-b border-border bg-background">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
            <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1.5 font-mono text-[0.7rem] tracking-widest uppercase text-muted-foreground">
                  <IdCard className="size-3.5" />
                  Parent &amp; guardian portal
                </p>

                <h2 className="display-serif mt-6 text-3xl font-semibold text-balance sm:text-4xl">
                  Your child&apos;s day, and your balance,{" "}
                  <span className="text-primary italic">in your pocket.</span>
                </h2>

                <p className="mt-5 max-w-xl text-lg text-pretty text-muted-foreground">
                  Your school gives you a card with a 16-digit number under the
                  barcode. That number is your sign-in &mdash; there is nothing
                  to install and no account to create.
                </p>

                <p className="mt-4 max-w-xl text-pretty text-muted-foreground">
                  Inside: the gate log for each of your children, what the PTA
                  has assessed and what you have already paid, and a way to
                  send the rest by GCash. Submit the reference and the school
                  confirms it &mdash; the receipt you get back is the same
                  official receipt the counter issues.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Button asChild size="lg">
                    <Link href="/portal/login">
                      Sign in with your parent card
                      <ArrowRight data-icon="inline-end" className="size-4" />
                    </Link>
                  </Button>
                </div>

                <p className="mt-5 text-sm text-muted-foreground">
                  No card yet? Ask the school office &mdash; they can print one
                  for you while you wait.
                </p>
              </div>

              <ul className="grid gap-4 sm:grid-cols-2">
                {PARENT_FEATURES.map((f) => (
                  <li
                    key={f.title}
                    className="rounded-2xl border border-border bg-card p-5 shadow-sm"
                  >
                    <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                      <f.icon className="size-5" />
                    </span>
                    <p className="mt-4 font-medium">{f.title}</p>
                    <p className="mt-1.5 text-sm text-pretty text-muted-foreground">
                      {f.body}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ── Collections ──────────────────────────────────────────────────
            Still the engine, now told as what stands behind the two screens
            above rather than as the product's headline. */}
        <section
          id="collections"
          className="scroll-mt-20 border-b border-border bg-muted/40"
        >
          {/* The extra bottom padding on wide screens is for the receipt stub
              that hangs off the panel — without it, it crosses the divider. */}
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24 lg:pb-44">
            <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
              <div>
                <p className="font-mono text-[0.7rem] tracking-widest text-muted-foreground uppercase">
                  Behind it, the ledger
                </p>
                <h2 className="display-serif mt-4 text-3xl font-semibold text-balance sm:text-4xl">
                  A payment sent from a phone lands in the same book as one paid
                  at the window.
                </h2>
                <p className="mt-5 text-lg text-pretty text-muted-foreground">
                  The PTA&apos;s collections system is what makes the balance in
                  the portal true. Dues are assessed across the whole enrolment
                  in one pass, cashiers record payments and print receipts, and
                  every peso &mdash; counter or GCash &mdash; is numbered from
                  the same receipt series and totalled into the same annual
                  report.
                </p>
                <p className="mt-4 text-pretty text-muted-foreground">
                  There is no stored paid-or-unpaid flag to drift: a balance is
                  always computed from the charges and the payments behind it.
                </p>
                <div className="mt-8">
                  <Button asChild variant="outline" size="lg">
                    <a href="#modules">Browse the modules</a>
                  </Button>
                </div>
              </div>

              <div className="lg:pl-4">
                <LedgerPreview />
              </div>
            </div>
          </div>
        </section>

        {/* ── Modules ──────────────────────────────────────────────────── */}
        <section id="modules" className="scroll-mt-20 border-b border-border bg-background">
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
                Children&apos;s movements and parents&apos; money deserve
                controls that hold even when someone is careless — or curious.
                These are enforced in the database, below the application, where
                a bug in a screen cannot get around them.
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
                  <Nfc className="size-7" />
                </span>
                <h2 className="display-serif mt-6 text-3xl font-semibold text-balance sm:text-4xl">
                  Have your card? Start with this morning&apos;s tap.
                </h2>
                <p className="mt-4 text-lg text-pretty text-muted-foreground">
                  Sign in with the number under the barcode, link Telegram in a
                  tap, and you will know about tomorrow&apos;s arrival before
                  the first bell.
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  <Button asChild size="lg">
                    <Link href="/portal/login">
                      Parent sign in
                      <ArrowRight data-icon="inline-end" className="size-4" />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline">
                    <a href="#gate">How the gate works</a>
                  </Button>
                </div>
                {/* Staff who scrolled the whole parent-facing page need their
                    own door named, not left implied. */}
                <div className="mt-6">
                  <Link
                    href="/login"
                    className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    School staff? Sign in with your invited Google account
                  </Link>
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
