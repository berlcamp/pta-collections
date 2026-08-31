import { z } from "zod";
import { dbId } from "@/lib/validations/id";

export const schoolYearSchema = z.object({
  id: dbId().optional(),
  name: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{4}$/, "Use the format 2026-2027."),
  start_date: z.string().min(1, "Start date is required."),
  end_date: z.string().min(1, "End date is required."),
  is_active: z.boolean(),
});

export const sectionSchema = z.object({
  id: dbId().optional(),
  school_year_id: dbId(),
  grade_level: z.string().min(1, "Choose a grade level."),
  name: z.string().trim().min(1, "Give the section a name.").max(60),
});

export const inviteSchema = z.object({
  email: z.email("Enter a valid email address."),
  full_name: z.string().trim().min(2, "Enter the person's name."),
  role: z.enum(["admin", "cashier", "treasurer", "viewer"]),
});

export const membershipStatusSchema = z.object({
  schoolUserId: dbId(),
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

  // Parent portal. These two live in pta.school_settings rather than as columns
  // on pta.schools -- they configure a surface outside this app (a payment rail
  // and a Telegram bot), and school_settings is where per-school configuration
  // that is not printed on a receipt belongs.
  gcash_number: z.string().trim().max(40).optional().nullable(),
  telegram_bot_username: z
    .string()
    .trim()
    .max(64)
    // BotFather's own rule. Accepting a leading @ and stripping it saves the
    // support call: everybody copies the handle with the @ attached, and the
    // deep link https://t.me/@Bot is a 404.
    .transform((v) => (v ?? "").replace(/^@/, ""))
    .refine(
      (v) => v === "" || /^[A-Za-z0-9_]{5,32}$/.test(v),
      "A bot username is 5–32 letters, digits or underscores.",
    )
    .optional()
    .nullable(),
  // 0017. Off means the 16-digit barcode alone signs a parent in — a
  // single-factor bearer credential that cashiers read at the POS all day.
  portal_require_pin: z.boolean(),
});
