import { CalendarDays, IdCard, TrendingUp, UserX } from "lucide-react";

import { requireRole } from "@/lib/auth/session";
import { getSectionSummary, getTeacherSections, pickSection } from "@/lib/data/teacher";
import { formatDate, todayInTimezone } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";
import { portalCard } from "@/components/portal/styles";
import { SectionSwitcher } from "@/components/teacher/section-switcher";
import { NoSections } from "@/components/teacher/no-sections";

export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function daysBefore(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10);
}

/**
 * A section over a date range: each student's days present out of the days
 * the gate saw anyone. Sorted fewest-first, so the students worth a word are
 * at the top.
 */
export default async function TeacherReportPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; from?: string; to?: string }>;
}) {
  const session = await requireRole(["teacher", "admin"]);
  const sp = await searchParams;
  const today = todayInTimezone(session.activeSchool.timezone);
  const to = sp.to && DATE.test(sp.to) && sp.to <= today ? sp.to : today;
  const fromDefault = daysBefore(to, 29);
  const from = sp.from && DATE.test(sp.from) && sp.from <= to ? sp.from : fromDefault;

  const sections = await getTeacherSections(session);
  const section = pickSection(sections, sp.section);
  if (!section) return <NoSections isAdmin={session.activeRole === "admin"} />;

  const rows = await getSectionSummary(section.section_id, from, to);
  const schoolDays = rows[0]?.school_days ?? 0;
  const carded = rows.filter((r) => r.has_card);
  const presentDays = carded.reduce((s, r) => s + r.days_present, 0);
  const rate =
    carded.length > 0 && schoolDays > 0
      ? (presentDays / (carded.length * schoolDays)) * 100
      : null;
  const neverSeen = carded.filter((r) => r.days_present === 0).length;

  const sorted = [...rows].sort((a, b) => {
    if (a.has_card !== b.has_card) return a.has_card ? -1 : 1;
    return a.days_present - b.days_present || a.full_name.localeCompare(b.full_name);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-blue-700">
            {section.grade_level} · {section.school_year_name}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {section.section_name} — attendance
          </h1>
        </div>

        <form method="get" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="section" value={section.section_id} />
          <label className="sr-only" htmlFor="from">From</label>
          <input
            id="from"
            type="date"
            name="from"
            defaultValue={from}
            max={today}
            className="h-11 rounded-full bg-white px-4 text-sm ring-1 ring-slate-200"
          />
          <span className="text-sm text-slate-500">to</span>
          <label className="sr-only" htmlFor="to">To</label>
          <input
            id="to"
            type="date"
            name="to"
            defaultValue={to}
            max={today}
            className="h-11 rounded-full bg-white px-4 text-sm ring-1 ring-slate-200"
          />
          <button
            type="submit"
            className="h-11 rounded-full bg-white px-4 text-sm font-medium ring-1 ring-slate-200 hover:bg-slate-50"
          >
            Show
          </button>
        </form>
      </div>

      <SectionSwitcher
        sections={sections}
        current={section.section_id}
        basePath="/teacher/report"
        keep={{ from: sp.from, to: sp.to }}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="portal-gradient rounded-3xl p-5 text-white shadow-lg shadow-blue-900/20">
          <p className="flex items-center gap-2 text-sm text-blue-100">
            <TrendingUp className="size-4" /> Attendance rate
          </p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">
            {rate === null ? "—" : `${rate.toFixed(1)}%`}
          </p>
          <p className="mt-1 text-xs text-blue-100">of carded students</p>
        </div>
        <Tile icon={CalendarDays} label="School days" value={String(schoolDays)}
          hint={`${formatDate(from)} – ${formatDate(to)}`} />
        <Tile icon={UserX} label="Never seen" value={String(neverSeen)} warn={neverSeen > 0} />
        <Tile icon={IdCard} label="No gate card" value={String(rows.length - carded.length)} />
      </div>

      {rows.length === 0 ? (
        <div className={cn(portalCard, "p-10 text-center text-sm text-slate-500")}>
          No students enrolled in this section.
        </div>
      ) : (
        <div className={cn(portalCard, "overflow-hidden")}>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3 sm:px-5">Student</th>
                <th className="hidden px-4 py-3 sm:table-cell">Last seen</th>
                <th className="px-4 py-3 text-right sm:px-5">Days present</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((r) => {
                const pct = schoolDays > 0 ? (r.days_present / schoolDays) * 100 : 0;
                return (
                  <tr key={r.student_id}>
                    <td className="px-4 py-3 sm:px-5">
                      <p className="font-medium text-slate-900">{r.full_name}</p>
                      {r.student_no && (
                        <p className="font-mono text-xs text-slate-500">{r.student_no}</p>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">
                      {r.last_seen ? formatDate(r.last_seen) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right sm:px-5">
                      {r.has_card ? (
                        <div className="ml-auto w-36 space-y-1.5">
                          <p className="font-mono font-semibold tabular-nums text-slate-900">
                            {r.days_present} / {schoolDays}
                          </p>
                          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500",
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="rounded-full bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                          No card
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs leading-relaxed text-slate-500">
        &ldquo;School days&rdquo; are the days the gate recorded anyone at all —
        nothing here knows the school calendar, so a holiday and an unplugged
        reader look the same. Students without a gate card are listed but never
        counted absent.
      </p>
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  hint,
  warn,
}: {
  icon: typeof UserX;
  label: string;
  value: string;
  hint?: string;
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
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
