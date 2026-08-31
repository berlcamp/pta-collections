import { z } from "zod";

/**
 * A primary key from THIS database.
 *
 * Not `z.uuid()`. Zod 4's `z.uuid()` enforces RFC 9562 — it checks the version
 * nibble and the variant bits — while PostgreSQL's `uuid` type checks only that
 * the value is 32 hex digits in 8-4-4-4-12 shape. Those are different rules,
 * and this database contains rows that satisfy the second but not the first:
 *
 *   parents_guardians.id = f05366e2-8b20-53a0-690b-f994824a4000
 *                                    ^                ^
 *                            version 5, variant 6 -> rejected by z.uuid()
 *
 * Every one of those ids is a legitimate key that Postgres issued, joins on,
 * and enforces foreign keys against. Validating them with a stricter rule than
 * the database's own turns a working row into "Unknown guardian." — which is
 * exactly what /admin/parent-cards did before this existed.
 *
 * `z.guid()` is Zod's any-version validator, and it matches Postgres exactly.
 * The database is the authority on what one of its own keys looks like.
 */
export function dbId() {
  return z.guid();
}
