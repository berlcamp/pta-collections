import { z } from "zod";
import { dbId } from "@/lib/validations/id";

/**
 * Donation input schemas.
 *
 * These mirror the constraints in migration 0014 rather than replacing them.
 * The database is still the authority — pta.record_donation re-checks the kind
 * rules, the program's status and the donor's tenant on every call. Validating
 * here only means the parent standing at the desk gets a sentence instead of a
 * Postgres exception.
 */

export const programSchema = z.object({
  id: dbId().optional(),
  schoolYearId: dbId(),
  name: z.string().trim().min(3, "Give the program a name.").max(150),
  description: z.string().trim().max(1000).optional().nullable(),
  category: z.enum(["program", "activity", "project", "fund", "other"]),
  target_amount: z
    .number()
    .positive("A target must be greater than zero.")
    .max(99_999_999.99)
    .nullable(),
  starts_on: z.string().nullable(),
  ends_on: z.string().nullable(),
  status: z.enum(["planned", "open", "closed", "cancelled"]),
  accepts_pledges: z.boolean(),
  accepts_in_kind: z.boolean(),
});

/** A new donor typed inline while recording a donation. */
export const donorInputSchema = z.object({
  display_name: z.string().trim().min(2, "Enter the donor's name.").max(150),
  donor_type: z.enum([
    "guardian",
    "alumnus",
    "staff",
    "business",
    "government",
    "organization",
    "other",
  ]),
  guardian_id: dbId().nullable().optional(),
  student_id: dbId().nullable().optional(),
  contact_number: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().max(160).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
});

export const donationSchema = z
  .object({
    schoolYearId: dbId(),
    programId: z.uuid("Choose the program this donation is for."),
    kind: z.enum(["cash", "in_kind"]),
    amount: z.number().positive("Enter an amount greater than zero."),
    paymentMethod: z
      .enum(["cash", "gcash", "bank_transfer", "other"])
      .nullable(),
    itemDescription: z.string().trim().max(500).nullable(),
    donorId: dbId().nullable(),
    donor: donorInputSchema.nullable(),
    isAnonymous: z.boolean(),
    pledgeId: dbId().nullable(),
    referenceNumber: z.string().trim().max(120).nullable(),
    remarks: z.string().trim().max(500).nullable(),
    idempotencyKey: z.string().min(1).max(120).nullable(),
  })
  // Cash needs a method; in-kind needs to say what was actually given.
  // The same pair of rules is a CHECK constraint in 0014 (donations_kind_shape).
  .refine((v) => v.kind !== "cash" || v.paymentMethod !== null, {
    message: "Choose how the money was received.",
    path: ["paymentMethod"],
  })
  .refine(
    (v) =>
      v.kind !== "in_kind" ||
      (v.itemDescription !== null && v.itemDescription.length >= 3),
    {
      message: "Describe what was donated — it is what the receipt says.",
      path: ["itemDescription"],
    },
  )
  // An anonymous donation carries no donor at all; a named one must have one.
  .refine((v) => v.isAnonymous || v.donorId !== null || v.donor !== null, {
    message: "Name the donor, or mark the donation anonymous.",
    path: ["donor"],
  })
  .refine((v) => !v.isAnonymous || v.pledgeId === null, {
    message: "A pledge names its donor, so it cannot be redeemed anonymously.",
    path: ["pledgeId"],
  });

export const pledgeSchema = z.object({
  schoolYearId: dbId(),
  programId: z.uuid("Choose the program being pledged to."),
  amount: z.number().positive("Enter an amount greater than zero."),
  donorId: dbId().nullable(),
  donor: donorInputSchema.nullable(),
  dueDate: z.string().nullable(),
  notes: z.string().trim().max(500).nullable(),
}).refine((v) => v.donorId !== null || v.donor !== null, {
  message: "A pledge must name its donor — an anonymous promise is not collectable.",
  path: ["donor"],
});

export const voidDonationSchema = z.object({
  donationId: dbId(),
  reason: z.string().trim().min(3, "A reason is required."),
});

export const cancelPledgeSchema = z.object({
  pledgeId: dbId(),
  reason: z.string().trim().min(3, "A reason is required."),
});

export const donorSchema = z.object({
  id: dbId(),
  display_name: z.string().trim().min(2, "Enter the donor's name.").max(150),
  donor_type: donorInputSchema.shape.donor_type,
  contact_number: z.string().trim().max(40).nullable(),
  email: z.string().trim().max(160).nullable(),
  address: z.string().trim().max(300).nullable(),
  notes: z.string().trim().max(1000).nullable(),
  active: z.boolean(),
});
