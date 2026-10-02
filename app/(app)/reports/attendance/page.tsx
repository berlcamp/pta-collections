import { CalendarCheck, CalendarDays, IdCardLanyard, ScanLine, UserCheck } from "lucide-react";

import { requireSchool } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getSchoolYears, resolveSchoolYear } from "@/lib/data/school";
import {
  attendanceWindow,
  getAttendanceDays,
  getAttendanceStudents,
  rollUpByGrade,
} from "@/lib/data/attendance";
import { formatDate, todayInTimezone } from "@/lib/utils/dates";
import { PageHeader, SectionHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { StatCard } from "@/components/common/stat-card";
import { ReportFilters } from "@/components/reports/report-filters";
import { ExportButton } from "@/components/reports/export-button";
import {
  AttendanceDayTable,
  AttendanceGradeTable,
  AttendanceStudentTable,
} from "@/components/tables/attendance-report-tables";

export const dynamic = "force-dynamic";

/**
 * Reports → Attendance.
 *
 * The gate's numbers, summarised for the school year rather than for this
 * morning — /super/attendance is the live board, this is the record.
 *
 * Everything on the page is built on one honest definition, stated on the page
 * itself rather than buried here: a student is PRESENT on a day when a card
 * that resolves to them passed a reader that day. So:
 *
 *   * The denominator is students HOLDING A CARD, never students enrolled. A
 *     school midway through issuing cards would otherwise read as a school
 *     with an attendance crisis.
 *   * A day nobody tapped is not in the report at all. Sundays, holidays,
 *     typhoon closures and a reader nobody plugged back in are indistinguishable
 *     in the data, and inventing a row for each would mean labelling it.
 *   * Nothing counts lateness or half-days. One reader cannot tell an arrival
 *     from a departure, which is the same reason /super/attendance calls the
 *     first tap of the day an arrival "by rule".
 *
 * The two summaries are SQL functions (0024), because a term of a large school
 * is far too many scans to count in Node — and because a day boundary is
 * Manila's, decided in SQL (D11).
 */
export default async function AttendanceReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireSchool();
  const sp = await searchParams;

  const [schoolYear, schoolYears] = await Promise.all([
    resolveSchoolYear(ctx.activeSchool.id, sp.sy),
    getSchoolYears(ctx.activeSchool.id),
  ]);

  if (!schoolYear) {
    return (
      <>
        <PageHeader title="Attendance report" />
        <EmptyState
          icon={CalendarCheck}
          title="No school year yet"
          description="Attendance is reported per school year. Create one under Administration → School years."
        />
      </>
    );
  }

  const today = todayInTimezone(ctx.activeSchool.timezone);
  const { from, to } = attendanceWindow(schoolYear, sp.from, sp.to, today);

  const [days, students] = await Promise.all([
    getAttendanceDays(ctx.activeSchool.id, from, to),
    getAttendanceStudents(ctx.activeSchool.id, schoolYear.id, from, to),
  ]);

  // The number of days the gate saw anybody. It is the only school-day count
  // available: nothing in the database knows the school calendar, so a run of
  // rows is what "days of school" has to mean here.
  const schoolDays = days.length;
  const carded = students.filter((s) => s.has_card);
  const presentDays = students.reduce((sum, s) => sum + s.days_present, 0);
  const averagePresent = schoolDays > 0 ? presentDays / schoolDays : 0;
  const rate =
    carded.length > 0 && schoolDays > 0
      ? (presentDays / (carded.length * schoolDays)) * 100
      : null;
  // Students who hold a card and were never seen. Separated from the cardless
  // on purpose: this list is worth acting on, and the other one is a job for
  // the card enrolment screen.
  const neverSeen = carded.filter((s) => s.days_present === 0).length;

  const time = (iso: string) =>
    new Intl.DateTimeFormat("en-PH", {
      timeZone: ctx.activeSchool.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));

  // A bare YYYY-MM-DD is a calendar date already — read it as UTC so it is not
  // shifted a day by the viewer's clock. formatDate applies the same rule.
  const weekday = (isoDate: string) => {
    const [y, m, d] = isoDate.split("-").map(Number);
    return new Intl.DateTimeFormat("en-PH", {
      weekday: "long",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(y, m - 1, d)));
  };

  const gradeRows = rollUpByGrade(students, schoolDays);

  return (
    <>
      <PageHeader
        title="Attendance report"
        description="Gate card taps, summarised by day, by grade and by student. A tap is a card passing the reader — it is not a register signed by a teacher."
        actions={
          can(ctx.activeRole, "exportReports") ? (
            <ExportButton report="attendance" />
          ) : undefined
        }
      />

      <ReportFilters
        schoolYears={schoolYears}
        currentYearId={schoolYear.id}
        show={{ dateRange: true }}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Attendance rate"
          value={rate === null ? "—" : `${rate.toFixed(1)}%`}
          hint={
            rate === null
              ? "no cards issued yet"
              : `of ${carded.length.toLocaleString()} carded students over ${schoolDays} day${schoolDays === 1 ? "" : "s"}`
          }
          icon={UserCheck}
          tone={rate !== null && rate < 80 ? "warning" : "positive"}
        />
        <StatCard
          label="Average present"
          value={
            schoolDays > 0
              ? Math.round(averagePresent).toLocaleString()
              : "—"
          }
          hint="students seen on a typical day"
          icon={ScanLine}
        />
        <StatCard
          label="Days with activity"
          value={schoolDays.toLocaleString()}
          hint={`${formatDate(from)} – ${formatDate(to)}`}
          icon={CalendarDays}
        />
        <StatCard
          label="Never seen"
          value={neverSeen.toLocaleString()}
          hint={
            students.length - carded.length > 0
              ? `plus ${(students.length - carded.length).toLocaleString()} holding no card`
              : "every student holds a card"
          }
          icon={IdCardLanyard}
          tone={neverSeen > 0 ? "warning" : "default"}
        />
      </div>

      {students.length - carded.length > 0 && (
        <p className="mb-6 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-muted-foreground">
          <strong className="font-medium text-foreground">
            {(students.length - carded.length).toLocaleString()} of{" "}
            {students.length.toLocaleString()} enrolled students hold no gate
            card.
          </strong>{" "}
          They cannot tap, so they are left out of every rate on this page
          rather than counted absent. Issue their cards under Gate attendance →
          Card enrolment to bring them into the report.
        </p>
      )}

      {schoolDays === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="The gate recorded nothing in this range"
          description="No card passed a reader between these dates. If that is a surprise, check the reader's last upload on the live attendance monitor."
        />
      ) : (
        <>
          <section>
            <SectionHeader
              title="Day by day"
              description="One row per day the gate saw anyone. Days with no taps at all are absent rather than zero — a Sunday, a holiday and an unplugged reader look identical in the data, so this page does not guess between them."
            />
            <AttendanceDayTable
              rows={days.map((d) => ({
                local_date: d.local_date,
                date_label: formatDate(d.local_date),
                weekday: weekday(d.local_date),
                students_present: d.students_present,
                carded: carded.length,
                scans: d.scans,
                unknown_scans: d.unknown_scans,
                first_time: time(d.first_scan_at),
                last_time: time(d.last_scan_at),
              }))}
            />
          </section>

          <section className="mt-8">
            <SectionHeader
              title="By grade level"
              description="The rate divides student-days seen by the days a carded student could have been seen. Students without a card are counted in Enrolled and nowhere else."
            />
            <AttendanceGradeTable rows={gradeRows} />
          </section>
        </>
      )}

      <section className="mt-8">
        <SectionHeader
          title="Student by student"
          description="Sorted by the fewest days present, so the students worth asking about are on the first page."
        />
        {students.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            title="No one is enrolled in this school year"
            description="Attendance is reported against the roll. Enrol students, or promote last year's, under Administration → School years."
          />
        ) : (
          <AttendanceStudentTable
            rows={students.map((s) => ({
              student_id: s.student_id,
              full_name: s.full_name,
              student_no: s.student_no,
              grade_level: s.grade_level,
              section_name: s.section_name,
              has_card: s.has_card,
              days_present: s.days_present,
              scans: s.scans,
              last_seen_label: s.last_seen ? formatDate(s.last_seen) : null,
              school_days: schoolDays,
            }))}
          />
        )}
      </section>
    </>
  );
}
