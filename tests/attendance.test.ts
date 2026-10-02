import { describe, expect, it } from "vitest";
import {
  attendanceWindow,
  groupScansByDay,
  rollUpByGrade,
} from "@/lib/data/attendance";
import type { AttendanceScan, AttendanceStudent } from "@/types/database.types";

const YEAR = { start_date: "2026-06-01", end_date: "2027-03-31" };

function student(over: Partial<AttendanceStudent>): AttendanceStudent {
  return {
    student_id: crypto.randomUUID(),
    full_name: "Cruz, Juan",
    student_no: null,
    grade_level: "Grade 7",
    section_name: null,
    student_status: "active",
    has_card: true,
    days_present: 0,
    scans: 0,
    first_seen: null,
    last_seen: null,
    last_scan_at: null,
    ...over,
  };
}

describe("attendanceWindow", () => {
  it("defaults to the school year", () => {
    expect(attendanceWindow(YEAR)).toEqual({
      from: "2026-06-01",
      to: "2027-03-31",
    });
  });

  it("stops a live year at today rather than running into the future", () => {
    // A year ending in March, read in September, must not report six months of
    // empty days between now and then as days the gate saw nothing.
    expect(attendanceWindow(YEAR, null, null, "2026-09-02").to).toBe(
      "2026-09-02",
    );
  });

  it("leaves a finished year alone", () => {
    expect(attendanceWindow(YEAR, null, null, "2027-08-01").to).toBe(
      "2027-03-31",
    );
  });

  it("clamps a filter that reaches outside the year", () => {
    const w = attendanceWindow(YEAR, "2020-01-01", "2030-01-01", "2026-09-02");
    expect(w).toEqual({ from: "2026-06-01", to: "2026-09-02" });
  });

  it("honours a filter inside the year", () => {
    const w = attendanceWindow(YEAR, "2026-08-01", "2026-08-31", "2026-09-02");
    expect(w).toEqual({ from: "2026-08-01", to: "2026-08-31" });
  });

  it("never returns a window that ends before it starts", () => {
    // "From September, to July" is a mistake in the filter, not a reason to
    // hand PostgREST a range no row can satisfy.
    const w = attendanceWindow(YEAR, "2026-09-01", "2026-07-01", "2026-09-02");
    expect(w.to >= w.from).toBe(true);
  });
});

describe("rollUpByGrade", () => {
  it("divides by carded students, not enrolled ones", () => {
    // Two students, one card, ten school days, and that one student was seen
    // on all ten. The grade is at 100% — a school that has issued half its
    // cards is not a school with 50% attendance.
    const rows = rollUpByGrade(
      [
        student({ has_card: true, days_present: 10 }),
        student({ has_card: false, days_present: 0 }),
      ],
      10,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].enrolled).toBe(2);
    expect(rows[0].carded).toBe(1);
    expect(rows[0].rate).toBe(100);
  });

  it("reports no rate at all when nobody in the grade holds a card", () => {
    // Not 0%. Zero of zero possible days is not an attendance figure, and
    // printing it as one would put the grade at the bottom of every ranking.
    const rows = rollUpByGrade([student({ has_card: false })], 10);
    expect(rows[0].rate).toBeNull();
  });

  it("reports no rate before the gate has run for a single day", () => {
    const rows = rollUpByGrade([student({ has_card: true })], 0);
    expect(rows[0].rate).toBeNull();
  });

  it("counts students seen at least once separately from student-days", () => {
    const rows = rollUpByGrade(
      [
        student({ days_present: 8 }),
        student({ days_present: 2 }),
        student({ days_present: 0 }),
      ],
      10,
    );
    expect(rows[0].seen).toBe(2);
    expect(rows[0].present_days).toBe(10);
    expect(rows[0].rate).toBeCloseTo((10 / 30) * 100);
  });

  it("orders grades numerically, not as strings", () => {
    const rows = rollUpByGrade(
      [
        student({ grade_level: "Grade 10" }),
        student({ grade_level: "Grade 7" }),
        student({ grade_level: "Grade 9" }),
      ],
      1,
    );
    expect(rows.map((r) => r.grade_level)).toEqual([
      "Grade 7",
      "Grade 9",
      "Grade 10",
    ]);
  });

  it("gives a student with no grade a row rather than dropping them", () => {
    const rows = rollUpByGrade([student({ grade_level: null })], 1);
    expect(rows[0].grade_level).toBe("—");
  });
});

describe("groupScansByDay", () => {
  function scan(local_date: string, scanned_at: string): AttendanceScan {
    return {
      event_id: scanned_at,
      school_id: "s",
      card_uid: "CAFE0011",
      device_id: "gate-01",
      scanned_at,
      received_at: scanned_at,
      clock_synced: true,
      direction: "in",
      queued: false,
      image_path: null,
      student_id: "st",
      full_name: "Cruz, Juan",
      student_no: null,
      grade_level: null,
      section_name: null,
      local_date,
      local_month: `${local_date.slice(0, 7)}-01`,
      school_timezone: "Asia/Manila",
    };
  }

  it("groups on SQL's local_date, not on the timestamp", () => {
    // Both taps are 23:00-ish UTC and belong to the following Manila morning.
    // Grouping on scanned_at here would split them across two days.
    const days = groupScansByDay([
      scan("2026-08-04", "2026-08-03T23:10:00Z"),
      scan("2026-08-03", "2026-08-02T23:05:00Z"),
      scan("2026-08-03", "2026-08-03T04:00:00Z"),
    ]);
    expect(days.map(([d]) => d)).toEqual(["2026-08-04", "2026-08-03"]);
    expect(days[1][1]).toHaveLength(2);
  });

  it("returns the newest day first", () => {
    const days = groupScansByDay([
      scan("2026-08-01", "2026-08-01T01:00:00Z"),
      scan("2026-08-09", "2026-08-09T01:00:00Z"),
    ]);
    expect(days[0][0]).toBe("2026-08-09");
  });

  it("has nothing to say about an empty list", () => {
    expect(groupScansByDay([])).toEqual([]);
  });
});
