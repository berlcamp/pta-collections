import { z } from "zod";
import { dbId } from "@/lib/validations/id";

export const paymentMethodSchema = z.enum([
  "cash",
  "gcash",
  "bank_transfer",
  "other",
]);

export const paymentLineSchema = z.object({
  charge_id: dbId(),
  amount: z.number().positive("Each line must be greater than zero."),
});

export const createPaymentSchema = z
  .object({
    studentId: dbId(),
    schoolYearId: dbId(),
    paymentMethod: paymentMethodSchema,
    items: z.array(paymentLineSchema).min(1, "Select at least one charge to pay."),
    referenceNumber: z.string().trim().max(64).optional().nullable(),
    remarks: z.string().trim().max(500).optional().nullable(),
    amountTendered: z.number().nonnegative().optional().nullable(),
    idempotencyKey: z.string().min(8).max(64),
  })
  .refine(
    (v) => v.paymentMethod === "cash" || v.amountTendered == null,
    { message: "Amount tendered applies to cash payments only.", path: ["amountTendered"] },
  )
  .refine(
    (v) =>
      v.paymentMethod === "cash" ||
      (v.referenceNumber != null && v.referenceNumber.length > 0),
    {
      message: "A reference number is required for non-cash payments.",
      path: ["referenceNumber"],
    },
  );

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

export const voidPaymentSchema = z.object({
  paymentId: dbId(),
  reason: z
    .string()
    .trim()
    .min(5, "Give a reason of at least 5 characters — it goes on the audit trail."),
});
