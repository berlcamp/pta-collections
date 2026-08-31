import { describe, expect, it } from "vitest";
import { z } from "zod";

import { dbId } from "@/lib/validations/id";

/**
 * These are REAL primary keys from the production database, and every one of
 * them was rejected by z.uuid() — which is what surfaced as "Unknown guardian."
 * when an administrator pressed Issue on /admin/parent-cards.
 */
const REAL_KEYS = [
  // gen_random_uuid(): a proper v4, which both validators accept.
  "07238b5b-7ed5-4a16-a636-68f1147ec49d",
  // Hash-derived. Postgres stores and joins on these happily; RFC 9562 does not
  // recognise their version/variant nibbles.
  "f05366e2-8b20-53a0-690b-f994824a4000",
  "b9c0a0d9-d5e1-b5c5-70ea-02ee977a4589",
  "497d224b-c591-8eaf-11e7-f0468cfd7670",
  "f53602b4-9fd0-d531-8694-8e914f1da47b",
];

describe("dbId", () => {
  it("accepts every key shape this database actually issues", () => {
    for (const key of REAL_KEYS) {
      expect(dbId().safeParse(key).success, key).toBe(true);
    }
  });

  // The regression guard. If someone swaps dbId() back to z.uuid() because it
  // reads more natural, this fails and says why.
  it("is deliberately looser than z.uuid(), which rejects four of the five", () => {
    const rejected = REAL_KEYS.filter((k) => !z.uuid().safeParse(k).success);
    expect(rejected).toHaveLength(4);
    for (const key of rejected) {
      expect(dbId().safeParse(key).success, key).toBe(true);
    }
  });

  it("still rejects things Postgres would also reject", () => {
    for (const bad of [
      "",
      "not-a-uuid",
      "07238b5b7ed54a16a63668f1147ec49d",          // unhyphenated
      "07238b5b-7ed5-4a16-a636-68f1147ec49",       // one digit short
      "07238b5b-7ed5-4a16-a636-68f1147ec49dd",     // one too many
      "0723 8b5b-7ed5-4a16-a636-68f1147ec49d",     // whitespace
      "g7238b5b-7ed5-4a16-a636-68f1147ec49d",      // not hex
    ]) {
      expect(dbId().safeParse(bad).success, bad).toBe(false);
    }
  });
});
