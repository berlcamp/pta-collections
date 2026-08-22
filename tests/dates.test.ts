import { describe, expect, it } from "vitest";
import { formatInTimeZone } from "@/lib/utils/tz";
import { todayInTimezone, startOfMonthInTimezone } from "@/lib/utils/dates";

describe("Manila day boundaries", () => {
  it("buckets an early-morning Manila payment into the correct local day", () => {
    // 2026-08-22 07:30 Manila is 2026-08-21 23:30 UTC. Bucketing by UTC would
    // put a morning payment into yesterday's cash drawer.
    const utc = new Date("2026-08-21T23:30:00Z");
    expect(formatInTimeZone(utc, "UTC")).toBe("2026-08-21");
    expect(formatInTimeZone(utc, "Asia/Manila")).toBe("2026-08-22");
  });

  it("handles the late-evening case in the other direction", () => {
    // 2026-08-22 23:30 Manila is 2026-08-22 15:30 UTC — same day either way.
    const utc = new Date("2026-08-22T15:30:00Z");
    expect(formatInTimeZone(utc, "Asia/Manila")).toBe("2026-08-22");
  });

  it("produces a YYYY-MM-DD string", () => {
    expect(todayInTimezone("Asia/Manila")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("derives the first of the month from the local date", () => {
    expect(startOfMonthInTimezone("Asia/Manila")).toMatch(/^\d{4}-\d{2}-01$/);
  });
});
