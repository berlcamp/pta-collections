import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  IdCard,
  LogIn,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";

import { requireRole } from "@/lib/auth/session";
import { getSectionDay, getTeacherSections, pickSection } from "@/lib/data/teacher";
import { todayInTimezone } from "@/lib/utils/dates";
import { dynamicRoute } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { portalCard } from "@/components/portal/styles";
import { SectionSwitcher } from "@/components/teacher/section-switcher";
import { NoSections } from "@/components/teacher/no-sections";

export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function shiftDay(iso: string, by: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + by));
  return t.toISOString().slice(0, 10);
}

/**
 * Today at the gate, for one section: who has tapped in, who has not been
 * seen, and who cannot be seen because they hold no card. A tap is a card
 * passing the reader, not a register — the page says so, as the attendance
 * report does.
 */
export default async function TeacherTodayPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; date?: string }>;
}) {
  const session = await requireRole(["teacher", "admin"]);
  const sp = await searchParams;
  const tz = session.activeSchool.timezone;
  const today = todayInTimezone(tz);
  const date = sp.date && DATE.test(sp.date) && sp.date <= today ? sp.date : today;

  const sections = await getTeacherSections(session);
  const section = pickSection(sections, sp.section);
  if (!section) return <NoSections isAdmin={session.activeRole === "admin"} />;

  const rows = await getSectionDay(section.section_id, date);
  const present = rows.filter((r) => r.first_scan_at);
  const carded = rows.filter((r) => r.has_card);
  const notSeen = carded.filter((r) => !r.first_scan_at);
  const noCard = rows.filter((r) => !r.has_card);

  const time = (iso: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));

  const dayLabel = (() => {
    const [y, m, d] = date.split("-").map(Number);
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(y, m - 1, d)));
  })();

  const href = (d: string) =>
    dynamicRoute(`/teacher?section=${section.section_id}${d === today ? "" : `&date=${d}`}`);

  // Present first (by arrival), then not seen, then no card — the order a
  // teacher reads a roll in at 7:30.
  const ordered = [
    ...present.sort((a, b) => a.first_scan_at!.localeCompare(b.first_scan_at!)),
    ...notSeen,
    ...noCard,
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-blue-700">
            {section.grade_level} · {section.school_year_name}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {section.section_name}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={href(shiftDay(date, -1))}
            aria-label="Previous day"
            className="grid size-11 place-items-center rounded-full bg-white ring-1 ring-slate-200 hover:bg-slate-50"
          >
            <ChevronLeft className="size-5" />
          </Link>
          <form method="get" className="flex items-center gap-2">
            <input type="hidden" name="section" value={section.section_id} />
            <input
              type="date"
              name="date"
              defaultValue={date}
              max={today}
              aria-label="Date"
              className="h-11 rounded-full bg-white px-4 text-sm ring-1 ring-slate-200"
            />
            <button
              type="submit"
              className="h-11 rounded-full bg-white px-4 text-sm font-medium ring-1 ring-slate-200 hover:bg-slate-50"
            >
              Go
            </button>
          </form>
          {date < today && (
            <Link
              href={href(shiftDay(date, 1))}
              aria-label="Next day"
              className="grid size-11 place-items-center rounded-full bg-white ring-1 ring-slate-200 hover:bg-slate-50"
            >
              <ChevronRight className="size-5" />
            </Link>
          )}
        </div>
      </div>

      <SectionSwitcher
        sections={sections}
        current={section.section_id}
        basePath="/teacher"
        keep={{ date: date === today ? undefined : date }}
      />

      <p className="text-sm text-slate-500">
        {date === today ? "Today, " : ""}
        {dayLabel}
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="portal-gradient rounded-3xl p-5 text-white shadow-lg shadow-blue-900/20">
          <p className="flex items-center gap-2 text-sm text-blue-100">
            <UserCheck className="size-4" /> Tapped in
          </p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">
            {present.length}
            <span className="text-lg font-normal text-blue-100"> / {carded.length}</span>
          </p>
          <p className="mt-1 text-xs text-blue-100">of students holding a card</p>
        </div>
        <Tile icon={UserX} label="Not seen" value={notSeen.length} warn={notSeen.length > 0} />
        <Tile icon={IdCard} label="No gate card" value={noCard.length} />
      </div>

      {rows.length === 0 ? (
        <div className={cn(portalCard, "flex flex-col items-center gap-2 p-10 text-center")}>
          <Users className="size-8 text-slate-400" />
          <p className="font-medium text-slate-900">No students enrolled in this section</p>
          <p className="text-sm text-slate-500">
            The school office assigns students to sections.
          </p>
        </div>
      ) : (
        <ul className={cn(portalCard, "divide-y divide-slate-100 overflow-hidden")}>
          {ordered.map((r) => (
            <li key={r.student_id} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
              <span
                aria-hidden
                className={cn(
                  "grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold",
                  r.first_scan_at
                    ? "bg-emerald-100 text-emerald-700"
                    : r.has_card
                      ? "bg-amber-100 text-amber-700"
                      : "bg-slate-100 text-slate-500",
                )}
              >
                {initials(r.full_name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.95rem] font-medium text-slate-900">
                  {r.full_name}
                </p>
                {r.student_no && (
                  <p className="font-mono text-xs text-slate-500">{r.student_no}</p>
                )}
              </div>
              <div className="shrink-0 text-right text-sm">
                {r.first_scan_at ? (
                  <>
                    <p className="flex items-center justify-end gap-1.5 font-semibold text-emerald-700">
                      <LogIn className="size-3.5" />
                      {time(r.first_scan_at)}
                    </p>
                    {r.scans > 1 && r.last_scan_at && (
                      <p className="text-xs text-slate-500">last tap {time(r.last_scan_at)}</p>
                    )}
                  </>
                ) : r.has_card ? (
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
                    Not seen
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                    No card
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs leading-relaxed text-slate-500">
        A tap is a gate card passing the reader — not a register. The first tap
        of the day is shown as arriving; one reader cannot tell coming in from
        going out. A student with no card cannot tap, so they are never counted
        as absent here.
      </p>
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  warn,
}: {
  icon: typeof UserX;
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div className={cn(portalCard, "p-5")}>
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Icon className="size-4" /> {label}
      </p>
      <p
        className={cn(
          "mt-1 text-3xl font-semibold tabular-nums",
          warn ? "text-amber-600" : "text-slate-900",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function initials(name: string): string {
  // display_name() is "Last, First Middle".
  const [last, rest] = name.split(", ");
  return `${(rest ?? "").charAt(0)}${(last ?? "").charAt(0)}`.toUpperCase() || "?";
}
