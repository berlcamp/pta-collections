import { z } from "zod";

export const feeTypeSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2, "Give the fee a name.").max(120),
  description: z.string().trim().max(500).optional().nullable(),
  category: z.enum(["annual", "penalty", "special", "other"]),
  default_amount: z
    .number()
    .nonnegative("Amount cannot be negative.")
    .max(9_999_999.99)
    .nullable(),
  is_recurring: z.boolean(),
  active: z.boolean(),
});

export const assessSchema = z.object({
  schoolYearId: z.uuid(),
  feeTypeIds: z.array(z.uuid()).min(1, "Select at least one fee type."),
  studentIds: z.array(z.uuid()).nullable(),
  dueDate: z.string().nullable(),
});

export const penaltySchema = z.object({
  studentId: z.uuid(),
  schoolYearId: z.uuid(),
  feeTypeId: z.uuid("Choose a penalty type."),
  amount: z.number().positive("The amount must be greater than zero."),
  description: z
    .string()
    .trim()
    .min(3, "Describe the reason — it appears on the student's record."),
  dueDate: z.string().nullable().optional(),
});

export const waiveSchema = z.object({
  chargeId: z.uuid(),
  amount: z.number().positive("The waived amount must be greater than zero."),
  reason: z.string().trim().min(3, "A reason is required."),
});

export const cancelChargeSchema = z.object({
  chargeId: z.uuid(),
  reason: z.string().trim().min(3, "A reason is required."),
});
