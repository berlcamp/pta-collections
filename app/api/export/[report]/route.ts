import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { resolveSchoolYear } from "@/lib/data/school";
import {
  attendanceWindow,
  getAttendanceDays,
  getAttendanceStudents,
} from "@/lib/data/attendance";
import {
  getAnnualReport,
  getCashierReport,
  getCollectionReport,
  getDonationReport,
  getFeeTypeReport,
} from "@/lib/reports/queries";
import {
  getDonorTotals,
  getPledges,
  getProgramTotals,
} from "@/lib/data/donations";
import { formatMoneyForExport } from "@/lib/financial/money";
import { todayInTimezone } from "@/lib/utils/dates";
import { csvResponse, toCsv } from "@/lib/utils/csv";

export const dynamic = "force-dynamic";

/**
 * CSV exports (D19). UTF-8 BOM for Excel; money as bare numbers so the cells
 * stay numeric. Exports carry only the columns already visible on screen.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ report: string }> },
) {
  const ctx = await getSessionContext();
  if (!ctx?.activeSchool || !ctx.activeRole) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!can(ctx.activeRole, "exportReports")) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { report } = await params;
  const sp = request.nextUrl.searchParams;
  const schoolYear = await resolveSchoolYear(
    ctx.activeSchool.id,
    sp.get("sy") ?? undefined,
  );
  if (!schoolYear) {
    return NextResponse.json({ error: "No school year" }, { status: 400 });
  }

  const filters = {
    schoolId: ctx.activeSchool.id,
    schoolYearId: schoolYear.id,
    from: sp.get("from"),
    to: sp.get("to"),
    feeTypeId: sp.get("fee"),
    cashierId: sp.get("cashier"),
    paymentMethod: sp.get("method"),
  };

  const stamp = `${ctx.activeSchool.school_code}-${schoolYear.name}`;

  switch (report) {
    case "collections": {
      const rows = await getCollectionReport(filters);
      return csvResponse(
        `collections-${stamp}.csv`,
        toCsv(
          ["Date", "Receipt", "Student", "Fees", "Amount", "Method", "Cashier"],
          rows.map((r) => [
            r.collection_date,
            r.receipt_number,
            r.student_name,
            r.fee_names,
            formatMoneyForExport(r.total_amount),
            r.payment_method,
            r.cashier_name,
          ]),
        ),
      );
    }

    case "fee-types": {
      const rows = await getFeeTypeReport(filters);
      return csvResponse(
        `fee-types-${stamp}.csv`,
        toCsv(
          ["Fee type", "Category", "Receipts", "Collected"],
          rows.map((r) => [
            r.fee_type_name,
            r.fee_category,
            r.receipt_count,
            formatMoneyForExport(r.total),
          ]),
        ),
      );
    }

    case "cashiers": {
      const rows = await getCashierReport(filters);
      return csvResponse(
        `cashiers-${stamp}.csv`,
        toCsv(
          ["Cashier", "Cash", "GCash", "Bank transfer", "Other", "Receipts", "Total"],
          rows.map((r) => [
            r.cashier_name,
            formatMoneyForExport(r.cash_total),
            formatMoneyForExport(r.gcash_total),
            formatMoneyForExport(r.bank_total),
            formatMoneyForExport(r.other_total),
            r.receipt_count,
            formatMoneyForExport(r.total),
          ]),
        ),
      );
    }

    case "outstanding": {
      const supabase = await createClient();
      let q = supabase
        .from("v_outstanding_dues")
        .select("*")
        .eq("school_id", ctx.activeSchool.id)
        .eq("school_year_id", schoolYear.id);
      if (sp.get("inactive") !== "1") q = q.eq("student_status", "active");
      const { data } = await q.order("last_name").order("first_name");

      type Row = Record<string, string | number | null>;
      return csvResponse(
        `outstanding-${stamp}.csv`,
        toCsv(
          [
            "Student", "Grade", "Section", "Student status", "Guardian",
            "Guardian contact", "Fee", "Due date", "Amount", "Waived",
            "Paid", "Balance",
          ],
          ((data ?? []) as Row[]).map((r) => [
            `${r.last_name}, ${r.first_name}`,
            r.grade_level,
            r.section_name,
            r.student_status,
            r.primary_guardian_name,
            r.primary_guardian_contact,
            r.fee_type_name,
            r.due_date,
            formatMoneyForExport(r.amount as number),
            formatMoneyForExport(r.waived_amount as number),
            formatMoneyForExport(r.paid as number),
            formatMoneyForExport(r.balance as number),
          ]),
        ),
      );
    }

    case "annual": {
      const r = await getAnnualReport(ctx.activeSchool.id, schoolYear.id);
      const rows: (string | number)[][] = [
        ["COLLECTIONS BY CATEGORY", ""],
        ...r.byCategory.map((c) => [c.category, formatMoneyForExport(c.total)]),
        ["Total collections", formatMoneyForExport(r.totalCollections)],
        ["", ""],
        ["DETAIL BY FEE TYPE", ""],
        ...r.byFeeType.map((f) => [f.fee_type_name, formatMoneyForExport(f.total)]),
        ["", ""],
        ["STUDENT PARTICIPATION", ""],
        ["Students enrolled", r.studentsEnrolled],
        ["Students assessed", r.studentsAssessed],
        ["Fully paid", r.fullyPaid],
        ["Partially paid", r.partiallyPaid],
        ["Unpaid", r.unpaid],
        ["", ""],
        ["FINANCIAL SUMMARY", ""],
        ["Total assessed", formatMoneyForExport(r.totalAssessed)],
        ["Total waived", formatMoneyForExport(r.totalWaived)],
        ["Total collected", formatMoneyForExport(r.totalCollected)],
        ["Total outstanding", formatMoneyForExport(r.totalOutstanding)],
      ];
      return csvResponse(
        `annual-pta-report-${stamp}.csv`,
        toCsv(["Item", "Amount"], rows),
      );
    }

    case "donations": {
      const rows = await getDonationReport({
        ...filters,
        kind: sp.get("kind"),
      });
      return csvResponse(
        `donations-${stamp}.csv`,
        toCsv(
          [
            "Date", "Acknowledgement", "Donor", "Program", "Kind",
            "Item", "Method", "Amount", "Received by",
          ],
          rows.map((r) => [
            r.collection_date,
            r.acknowledgement_number,
            r.donor_name,
            r.program_name,
            r.kind === "cash" ? "Cash" : "In kind",
            r.item_description,
            r.payment_method,
            formatMoneyForExport(r.amount),
            r.received_by_name,
          ]),
        ),
      );
    }

    case "donation-programs": {
      const rows = await getProgramTotals(ctx.activeSchool.id, schoolYear.id);
      return csvResponse(
        `donation-programs-${stamp}.csv`,
        toCsv(
          [
            "Program", "Category", "Status", "Target", "Cash received",
            "In-kind value", "Total received", "Progress %", "Donors",
            "Gifts", "Pledged", "Pledge outstanding",
          ],
          rows.map((r) => [
            r.name,
            r.category,
            r.status,
            r.target_amount === null ? "" : formatMoneyForExport(r.target_amount),
            formatMoneyForExport(r.cash_received),
            formatMoneyForExport(r.in_kind_value),
            formatMoneyForExport(r.total_received),
            r.progress_pct === null ? "" : r.progress_pct,
            r.donor_count,
            r.donation_count,
            formatMoneyForExport(r.pledged_total),
            formatMoneyForExport(r.pledge_outstanding),
          ]),
        ),
      );
    }

    case "pledges": {
      const rows = await getPledges(ctx.activeSchool.id, schoolYear.id);
      return csvResponse(
        `pledges-${stamp}.csv`,
        toCsv(
          [
            "Donor", "Contact", "Program", "Pledged", "Received",
            "Still due", "Due date", "Status",
          ],
          rows.map((r) => [
            r.donor_name,
            r.donor_contact,
            r.program_name,
            formatMoneyForExport(r.pledged_amount),
            formatMoneyForExport(r.fulfilled_amount),
            formatMoneyForExport(r.remaining_amount),
            r.due_date,
            r.fulfilment_status,
          ]),
        ),
      );
    }

    case "donors": {
      const rows = await getDonorTotals(ctx.activeSchool.id, schoolYear.id, 5000);
      return csvResponse(
        `donors-${stamp}.csv`,
        toCsv(
          [
            "Donor", "Type", "Contact", "Cash given", "In-kind given",
            "Total given", "Gifts", "Programs", "Last gift",
          ],
          rows.map((r) => [
            r.display_name,
            r.donor_type,
            r.contact_number,
            formatMoneyForExport(r.cash_given),
            formatMoneyForExport(r.in_kind_given),
            formatMoneyForExport(r.total_given),
            r.donation_count,
            r.program_count,
            r.last_donation_at,
          ]),
        ),
      );
    }

    case "attendance": {
      const { from, to } = attendanceWindow(
        schoolYear,
        filters.from,
        filters.to,
        todayInTimezone(ctx.activeSchool.timezone),
      );
      const [days, students] = await Promise.all([
        getAttendanceDays(ctx.activeSchool.id, from, to),
        getAttendanceStudents(ctx.activeSchool.id, schoolYear.id, from, to),
      ]);
      const schoolDays = days.length;

      // One file, two blocks, the same shape as the annual report: the daily
      // totals a treasurer reads and the per-student roll a class adviser does.
      // "Days present" is left EMPTY for a student holding no card rather than
      // written as 0 — in a spreadsheet a zero sorts and sums, and this one
      // would put a child with no plastic at the top of a truancy list.
      const rows: (string | number)[][] = [
        ...days.map((d) => [
          d.local_date,
          d.students_present,
          d.scans,
          d.unknown_scans,
          "",
        ]),
        ["", "", "", "", ""],
        ["STUDENT BY STUDENT", "", "", "", ""],
        ["Student", "Grade", "Section", "Holds a card", `Days present of ${schoolDays}`],
        ...students.map((s) => [
          s.full_name,
          s.grade_level ?? "",
          s.section_name ?? "",
          s.has_card ? "Yes" : "No",
          s.has_card ? s.days_present : "",
        ]),
      ];

      return csvResponse(
        `attendance-${stamp}-${from}-to-${to}.csv`,
        toCsv(["Date", "Students present", "Taps", "Unknown taps", ""], rows),
      );
    }

    default:
      return NextResponse.json({ error: "Unknown report" }, { status: 404 });
  }
}
