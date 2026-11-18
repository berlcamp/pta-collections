import { z } from "zod";
import { dbId } from "@/lib/validations/id";

export const feeTypeSchema = z.object({
  id: dbId().optional(),
  name: z.string().trim().min(2, "Give the fee a name.").max(120),
  description: z.string().trim().max(500).optional().nullable(),
  category: z.enum(["annual", "penalty", "special", "other", "homeroom"]),
  default_amount: z
    .number()
    .nonnegative("Amount cannot be negative.")
    .max(9_999_999.99)
    .nullable(),
  billing_basis: z.enum(["per_student", "per_family"]),
  is_recurring: z.boolean(),
  active: z.boolean(),
});

/**
 * Who a bulk assessment reaches: the whole school, some grades, or some
 * sections (0026). The scope is resolved in SQL from student_enrollments, so
 * the browser names grades and sections, never students.
 */
export const assessSchema = z
  .object({
    schoolYearId: dbId(),
    feeTypeIds: z.array(dbId()).min(1, "Select at least one fee type."),
    gradeLevels: z.array(z.string().min(1)).nullable(),
    sectionIds: z.array(dbId()).nullable(),
    amount: z
      .number()
      .positive("The amount must be greater than zero.")
      .max(9_999_999.99)
      .nullable(),
    dueDate: z.string().nullable(),
  })
  .refine((v) => !(v.gradeLevels?.length && v.sectionIds?.length), {
    message: "Choose grades or sections, not both.",
  })
  .refine((v) => v.amount == null || new Set(v.feeTypeIds).size === 1, {
    message: "An amount can only be set when assessing a single fee type.",
  });

export const penaltySchema = z.object({
  studentId: dbId(),
  schoolYearId: dbId(),
  feeTypeId: z.uuid("Choose a penalty type."),
  amount: z.number().positive("The amount must be greater than zero."),
  description: z
    .string()
    .trim()
    .min(3, "Describe the reason — it appears on the student's record."),
  dueDate: z.string().nullable().optional(),
});

export const waiveSchema = z.object({
  chargeId: dbId(),
  amount: z.number().positive("The waived amount must be greater than zero."),
  reason: z.string().trim().min(3, "A reason is required."),
});

export const cancelChargeSchema = z.object({
  chargeId: dbId(),
  reason: z.string().trim().min(3, "A reason is required."),
});
