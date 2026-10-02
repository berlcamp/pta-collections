import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarCheck,
  ClipboardList,
  FileText,
  IdCardLanyard,
  LogIn,
  LogOut,
  Receipt,
  ScanLine,
  Users,
  Wallet,
} from "lucide-react";
import { requireSchool } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getSchoolYears, resolveSchoolYear } from "@/lib/data/school";
import { getStudentProfile } from "@/lib/data/students";
import {
  attendanceWindow,
  getLiveStudentCard,
  getStudentScans,
  groupScansByDay,
} from "@/lib/data/attendance";
import { formatMoney } from "@/lib/financial/money";
import {
  formatDate,
  formatDateTime,
  todayInTimezone,
} from "@/lib/utils/dates";
import { formatNameFull } from "@/lib/utils/names";
import { PageHeader, SectionHeader } from "@/components/common/page-header";
import { PageTabs, type PageTab } from "@/components/common/page-tabs";
import { StatCard } from "@/components/common/stat-card";
import { StudentStatusBadge } from "@/components/common/status-badge";
import { SchoolYearPicker } from "@/components/common/school-year-picker";
import { EmptyState } from "@/components/common/empty-state";
import { StudentChargesTable } from "@/components/tables/student-charges-table";
import { PaymentsTable } from "@/components/tables/payments-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AttendanceScan } from "@/types/database.types";

export const dynamic = "force-dynamic";

/**
 * One student, three views of them.
 *
 * The tab lives in the URL rather than in client state because each panel is a
 * different set of queries — the attendance scans are not fetched at all while
 * you are reading the fee ledger. See components/common/page-tabs.tsx.
 *
 * What stays ABOVE the tabs is what is true of the student regardless of which
 * one you are on: their name, their enrolment line, their status, and the
 * school year the whole page is being read for. Moving the year picker into a
 * panel would let two tabs disagree about which year they are showing.
 */
const TABS: PageTab[] = [
  { key: "details", label: "Details" },
  { key: "fees", label: "PTA fees" },
  { key: "attendance", label: "Attendance" },
];

export default async function StudentProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sy?: string; tab?: string }>;
}) {
  const ctx = await requireSchool();
  const { id } = await params;
  const { sy, tab: tabParam } = await searchParams;

  const tab = TABS.some((t) => t.key === tabParam) ? tabParam! : TABS[0].key;

  const [schoolYear, schoolYears] = await Promise.all([
    resolveSchoolYear(ctx.activeSchool.id, sy),
    getSchoolYears(ctx.activeSchool.id),
  ]);
  if (!schoolYear) notFound();

  const profile = await getStudentProfile(id, ctx.activeSchool.id, schoolYear.id);
  if (!profile) notFound();

  const { student, enrollment, guardians, charges, payments, totals } = profile;
  const outstanding = charges.filter(
    (c) => c.status === "active" && Number(c.balance) > 0,
  );

  // Only the attendance panel pays for the gate reads. The other two tabs are
  // the ones opened all day at the counter, and neither has any use for them.
  let scans: AttendanceScan[] = [];
  let card: { card_uid: string; issued_at: string } | null = null;
  let range = { from: schoolYear.start_date, to: schoolYear.end_date };
  if (tab === "attendance") {
    range = attendanceWindow(
      schoolYear,
      null,
      null,
      todayInTimezone(ctx.activeSchool.timezone),
    );
    [scans, card] = await Promise.all([
      getStudentScans(ctx.activeSchool.id, student.id, range.from, range.to),
      getLiveStudentCard(ctx.activeSchool.id, student.id),
    ]);
  }

  const days = groupScansByDay(scans);

  return (
    <>
      <PageHeader
        title={formatNameFull(student)}
        description={[
          enrollment?.grade_level,
          enrollment?.section?.name,
          enrollment?.student_number && `No. ${enrollment.student_number}`,
          student.lrn && `LRN ${student.lrn}`,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <SchoolYearPicker years={schoolYears} current={schoolYear.id} />
            {can(ctx.activeRole, "recordPayment") && outstanding.length > 0 && (
              <Button asChild>
                <Link href={`/collections/new?student=${student.id}`}>
                  <Wallet className="size-4" />
                  Record payment
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StudentStatusBadge status={student.status} />
        {enrollment && enrollment.status !== "enrolled" && (
          <Badge variant="outline">
            Enrollment: {enrollment.status.replace("_", " ")}
          </Badge>
        )}
      </div>

      <PageTabs tabs={TABS} active={tab} />

      {tab === "details" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="h-fit">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Student</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <Detail label="Full name">{formatNameFull(student)}</Detail>
              <Detail label="LRN">
                {student.lrn ? (
                  <span className="font-mono text-xs">{student.lrn}</span>
                ) : (
                  "—"
                )}
              </Detail>
              <Detail label="Sex">
                {student.sex === "M"
                  ? "Male"
                  : student.sex === "F"
                    ? "Female"
                    : "—"}
              </Detail>
              <Detail label="Birth date">
                {student.birth_date ? formatDate(student.birth_date) : "—"}
              </Detail>
              <Detail label="Status">
                <StudentStatusBadge status={student.status} />
              </Detail>
              <Detail label="Added">{formatDate(student.created_at)}</Detail>
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                Enrollment · {schoolYear.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {enrollment ? (
                <>
                  <Detail label="Grade">{enrollment.grade_level}</Detail>
                  <Detail label="Section">
                    {enrollment.section?.name ?? "Unassigned"}
                  </Detail>
                  <Detail label="Student no.">
                    {enrollment.student_number ?? "—"}
                  </Detail>
                  <Detail label="Status">
                    {enrollment.status.replace("_", " ")}
                  </Detail>
                </>
              ) : (
                // Enrollment is per (student, school year), so this is the
                // ordinary state of a student in a year they were not in —
                // and the state a whole school is in the day a new year goes
                // active and nobody has been promoted yet (0021).
                <p className="py-2 text-muted-foreground">
                  Not enrolled in {schoolYear.name}. No fee can be recorded and
                  the gate will not expect them until they are.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Users className="size-4 text-muted-foreground" />
                Parents / Guardians
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {guardians.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No guardian on record.
                </p>
              ) : (
                guardians.map((g) => (
                  <div key={g.id} className="py-3 text-sm first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">
                        {g.first_name} {g.last_name}
                      </p>
                      {g.is_primary && <Badge variant="secondary">Primary</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {g.relationship}
                    </p>
                    {g.contact_number && (
                      <p className="font-mono text-xs">{g.contact_number}</p>
                    )}
                    {g.email && <p className="text-xs break-all">{g.email}</p>}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "fees" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total charges"
              value={formatMoney(totals.charged)}
              icon={ClipboardList}
            />
            <StatCard
              label="Total paid"
              value={formatMoney(totals.paid)}
              tone="positive"
              icon={Wallet}
            />
            <StatCard
              label="Outstanding"
              value={formatMoney(totals.outstanding)}
              tone={totals.outstanding > 0 ? "warning" : "default"}
              icon={FileText}
            />
            <StatCard
              label="Transactions"
              value={totals.transactions.toLocaleString()}
              icon={Receipt}
            />
          </div>

          <section className="mt-8">
            <SectionHeader title="Charges" />
            {charges.length === 0 ? (
              <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                No charges assessed for {schoolYear.name}.
              </p>
            ) : (
              <StudentChargesTable
                canWaive={can(ctx.activeRole, "waiveCharge")}
                rows={charges.map((c) => ({
                  id: c.id,
                  fee_type_name: c.fee_type_name,
                  description: c.description,
                  status_reason: c.status_reason,
                  due: c.due_date ? formatDate(c.due_date) : "—",
                  amount: Number(c.amount),
                  waived_amount: Number(c.waived_amount),
                  paid: Number(c.paid),
                  balance: Number(c.balance),
                  status: c.status,
                  payment_status: c.payment_status,
                }))}
              />
            )}
          </section>

          <section className="mt-8">
            <SectionHeader title="Payment history" />
            {payments.length === 0 ? (
              <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                No payments recorded for {schoolYear.name}.
              </p>
            ) : (
              <PaymentsTable
                searchable={false}
                pageSize={0}
                rows={payments.map((p) => ({
                  id: p.id,
                  receipt_number: p.receipt_number,
                  when: formatDateTime(
                    p.payment_date,
                    ctx.activeSchool.timezone,
                  ),
                  student_name: formatNameFull(student),
                  total_amount: Number(p.total_amount),
                  payment_method: p.payment_method,
                  cashier_name: p.collector?.full_name ?? "—",
                  status: p.status,
                }))}
              />
            )}
          </section>
        </>
      )}

      {tab === "attendance" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Days seen"
              value={days.length.toLocaleString()}
              hint={`in ${schoolYear.name}`}
              icon={CalendarCheck}
              tone={days.length > 0 ? "positive" : "default"}
            />
            <StatCard
              label="Card taps"
              value={scans.length.toLocaleString()}
              hint="every pass of the reader, in and out"
              icon={ScanLine}
            />
            <StatCard
              label="Last seen"
              value={days.length > 0 ? formatDate(days[0][0]) : "—"}
              hint={
                days.length > 0
                  ? `${days[0][1].length} tap${days[0][1].length === 1 ? "" : "s"} that day`
                  : "no scan on record"
              }
              icon={CalendarCheck}
            />
            <StatCard
              label="Gate card"
              value={card ? "Issued" : "None"}
              hint={
                card
                  ? `${card.card_uid} · since ${formatDate(card.issued_at)}`
                  : "cannot be seen by the reader"
              }
              icon={IdCardLanyard}
              tone={card ? "default" : "warning"}
            />
          </div>

          <section className="mt-8">
            <SectionHeader
              title="Gate scans"
              description="Newest first. A row is this student's card passing a reader — with one reader at the gate, nothing here tells you which way they were walking."
            />

            {!card && (
              // The distinction the whole tab turns on. Without it an empty
              // list reads as "this child never comes to school".
              <p className="mb-4 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-muted-foreground">
                <strong className="font-medium text-foreground">
                  This student holds no gate card.
                </strong>{" "}
                They cannot tap, so an empty list below says nothing about
                whether they came to school. Issue one under Gate attendance →
                Card enrolment.
              </p>
            )}

            {days.length === 0 ? (
              <EmptyState
                icon={ScanLine}
                title={card ? "No scans in this school year" : "Nothing to show"}
                description={
                  card
                    ? "This card has not passed a reader between " +
                      `${formatDate(range.from)} and ${formatDate(range.to)}.`
                    : "A student with no card leaves no trace at the gate."
                }
              />
            ) : (
              <div className="space-y-4">
                {days.map(([day, dayScans]) => (
                  <div key={day}>
                    <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {formatDate(day)}
                    </h3>
                    <Card>
                      <CardContent className="divide-y p-0">
                        {dayScans.map((scan) => (
                          <ScanRow
                            key={scan.event_id}
                            scan={scan}
                            timezone={ctx.activeSchool.timezone}
                          />
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

function ScanRow({
  scan,
  timezone,
}: {
  scan: AttendanceScan;
  timezone: string;
}) {
  const inbound = scan.direction === "in";
  const time = new Intl.DateTimeFormat("en-PH", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(scan.scanned_at));

  return (
    <div className="flex items-center gap-3 p-3">
      <div
        className={
          inbound
            ? "grid size-9 shrink-0 place-items-center rounded-lg bg-success/10 text-success"
            : "grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
        }
      >
        {inbound ? <LogIn className="size-4" /> : <LogOut className="size-4" />}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium tabular-nums">{time}</p>
        <p className="truncate text-xs text-muted-foreground">
          {scan.device_id} · card {scan.card_uid}
        </p>
      </div>

      {/* Both flags mean the time beside them is not what it looks like, so
          neither is decoration. `queued` arrived after an outage; an unsynced
          clock was reconstructed from the device's uptime. */}
      <div className="flex shrink-0 flex-wrap justify-end gap-1">
        {!scan.clock_synced && (
          <Badge variant="outline" className="text-[10px] text-warning">
            Estimated time
          </Badge>
        )}
        {scan.queued && (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            Delivered late
          </Badge>
        )}
      </div>
    </div>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2 border-b py-1.5 last:border-0">
      <dt className="w-24 shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}
