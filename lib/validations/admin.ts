import { z } from "zod";

export const schoolYearSchema = z.object({
  id: z.uuid().optional(),
  name: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{4}$/, "Use the format 2026-2027."),
  start_date: z.string().min(1, "Start date is required."),
  end_date: z.string().min(1, "End date is required."),
  is_active: z.boolean(),
});

export const sectionSchema = z.object({
  id: z.uuid().optional(),
  school_year_id: z.uuid(),
  grade_level: z.string().min(1, "Choose a grade level."),
  name: z.string().trim().min(1, "Give the section a name.").max(60),
});

export const inviteSchema = z.object({
  email: z.email("Enter a valid email address."),
  full_name: z.string().trim().min(2, "Enter the person's name."),
  role: z.enum(["admin", "cashier", "treasurer", "viewer"]),
});

export const membershipStatusSchema = z.object({
  schoolUserId: z.uuid(),
  status: z.enum(["active", "inactive"]),
});

export const schoolSchema = z.object({
  school_code: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and hyphens only."),
  name: z.string().trim().min(3, "Enter the school name."),
  receipt_prefix: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{2,10}$/, "2–10 letters or digits, e.g. ONHS."),
  short_name: z.string().trim().max(60).optional().nullable(),
  address: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  province: z.string().trim().max(80).optional().nullable(),
  region: z.string().trim().max(80).optional().nullable(),
  contact_number: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().max(120).optional().nullable(),
});

export const schoolSettingsSchema = z.object({
  name: z.string().trim().min(3),
  short_name: z.string().trim().max(60).optional().nullable(),
  address: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  province: z.string().trim().max(80).optional().nullable(),
  region: z.string().trim().max(80).optional().nullable(),
  contact_number: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().max(120).optional().nullable(),
  receipt_prefix: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{2,10}$/, "2–10 letters or digits."),
  receipt_footer_text: z.string().trim().max(300).optional().nullable(),
  timezone: z.string().trim().min(3),
});
