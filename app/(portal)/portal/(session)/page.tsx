import type { Route } from "next";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  School,
  ScanLine,
  Send,
  Users,
  Wallet,
} from "lucide-react";

import { LocaleSwitch } from "@/components/portal/locale-switch";
import {
  EmptyState,
  PortalScreen,
  SectionTitle,
  givenName,
  initials,
} from "@/components/portal/screen";
import { SignOutButton } from "@/components/portal/sign-out-button";
import { portalCard } from "@/components/portal/styles";
import {
  getPortalAccount,
  getPortalChildren,
  getPortalTelegram,
} from "@/lib/data/portal";
import { peso, t } from "@/lib/portal/i18n";
import { requirePortalSession } from "@/lib/portal/session";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Home: a balance, two big buttons, and the children.
 *
 * Laid out like the first screen of a banking app — the number you came for
 * at the top, then the two things you can DO (pay; connect Telegram), then the
 * accounts underneath. There is no tab bar: Pay and Telegram are the only two
 * destinations, and attendance hangs off each child as a small link.
 */
export default async function PortalHomePage() {
  const session = await requirePortalSession();
  const copy = t(session.locale);

  const [account, children, telegram] = await Promise.all([
    getPortalAccount(),
    getPortalChildren(),
    getPortalTelegram(),
  ]);

  const totalDue = children.reduce(
    (sum, child) => sum + Math.max(0, Number(child.outstanding_balance)),
    0,
  );
  const schoolYear = children.find((c) => c.school_year_name)?.school_year_name;
  const guardian = account?.guardian_name ?? "";

  return (
    <PortalScreen
      hero={
        <>
          <div className="flex h-14 items-center gap-3">
            <div
              aria-hidden
              className="grid size-11 shrink-0 place-items-center rounded-full bg-white/15 text-sm font-semibold ring-1 ring-white/25"
            >
              {initials(guardian)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-blue-100">{copy.welcome}</p>
              <p className="truncate text-base font-semibold leading-tight">
                {givenName(guardian)}
              </p>
            </div>
            <LocaleSwitch locale={session.locale} />
            <SignOutButton locale={session.locale} />
          </div>

          <div className="mt-5 rounded-3xl bg-white/10 p-5 ring-1 ring-white/20 backdrop-blur-sm md:p-7">
            <p className="flex items-center gap-1.5 text-xs font-medium text-blue-100">
              <School className="size-3.5" />
              <span className="truncate">{account?.school_name}</span>
            </p>
            <p className="mt-3 text-sm text-blue-100">{copy.totalDue}</p>
            <p className="mt-0.5 font-mono text-[2.125rem] font-semibold leading-tight tracking-tight tabular-nums md:text-5xl">
              {peso(totalDue)}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-blue-100/90">
              <Users className="size-3.5" />
              {copy.childCount(children.length)}
              {schoolYear && <> · S.Y. {schoolYear}</>}
            </p>
          </div>
        </>
      }
    >
      <nav aria-label={copy.menu} className="grid gap-3 md:grid-cols-2 md:gap-4">
        <ActionTile
          href="/portal/pay"
          icon={Wallet}
          iconClass="portal-cta"
          title={copy.payTile}
          subtitle={totalDue > 0 ? `${copy.amountDue}: ${peso(totalDue)}` : copy.payTileSub}
        />
        <ActionTile
          href="/portal/telegram"
          icon={Send}
          iconClass="bg-sky-500"
          title={copy.telegramTile}
          subtitle={
            telegram?.is_linked && telegram.telegram_active
              ? copy.telegramTileOn
              : copy.telegramTileOff
          }
          done={Boolean(telegram?.is_linked && telegram.telegram_active)}
        />
      </nav>

      <SectionTitle>{copy.childrenTitle}</SectionTitle>

      {children.length === 0 && (
        <EmptyState icon={Users}>{copy.noChildren}</EmptyState>
      )}

      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        {children.map((child) => {
          const owes = Number(child.outstanding_balance) > 0;
          return (
            <article key={child.student_id} className={cn(portalCard, "overflow-hidden")}>
              <div className="flex items-center gap-3 p-4">
                <div
                  aria-hidden
                  className="grid size-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-sm font-semibold text-blue-700"
                >
                  {initials(child.full_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{child.full_name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {[child.grade_level, child.section_name].filter(Boolean).join(" · ") ||
                      child.student_no}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={cn(
                      "font-mono text-base font-semibold tabular-nums",
                      owes ? "text-slate-900" : "text-emerald-600",
                    )}
                  >
                    {peso(child.outstanding_balance)}
                  </p>
                  <p
                    className={cn(
                      "text-[0.7rem] font-medium",
                      owes ? "text-amber-600" : "text-emerald-600",
                    )}
                  >
                    {owes ? copy.outstanding : copy.settled}
                  </p>
                </div>
              </div>

              {/* A child who has left stays visible — hiding them generates a
                  support call — but online payment is blocked, because
                  pta.payments carries an FK to student_enrollments and the
                  claim could never be approved. */}
              {!child.is_enrolled && (
                <div className="mx-4 mb-3 flex gap-2 rounded-2xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <div>
                    <p className="font-medium">{copy.notEnrolled}</p>
                    <p className="mt-0.5">{copy.notEnrolledHelp}</p>
                  </div>
                </div>
              )}

              <Link
                href={{
                  pathname: "/portal/attendance",
                  query: { student: child.student_id },
                }}
                className="flex h-12 items-center gap-2 border-t border-slate-100 px-4 text-sm font-medium text-blue-700 transition-colors hover:bg-slate-50 active:bg-slate-100"
              >
                <ScanLine className="size-4" />
                {copy.viewAttendance}
                <ChevronRight className="ml-auto size-4 text-slate-400" />
              </Link>
            </article>
          );
        })}
      </div>
    </PortalScreen>
  );
}

function ActionTile({
  href,
  icon: Icon,
  iconClass,
  title,
  subtitle,
  done,
}: {
  href: Route;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  title: string;
  subtitle: string;
  done?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        portalCard,
        "flex min-h-[5.5rem] items-center gap-4 p-4 transition-transform duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200",
      )}
    >
      <div
        className={cn(
          "grid size-14 shrink-0 place-items-center rounded-2xl text-white shadow-md shadow-blue-900/15",
          iconClass,
        )}
      >
        <Icon className="size-7" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[1.05rem] font-semibold text-slate-900">{title}</p>
        <p
          className={cn(
            "mt-0.5 flex items-center gap-1 text-sm",
            done ? "text-emerald-600" : "text-slate-500",
          )}
        >
          {done && <CheckCircle2 className="size-3.5 shrink-0" />}
          <span className="truncate">{subtitle}</span>
        </p>
      </div>
      <ChevronRight className="size-5 shrink-0 text-slate-400" />
    </Link>
  );
}
