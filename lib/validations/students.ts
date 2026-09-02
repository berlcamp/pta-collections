import { z } from "zod";
import { dbId } from "@/lib/validations/id";

/**
 * A student carries exactly ONE parent/guardian — the collection contact the
 * school actually calls. That guardian is either a link to a record already in
 * this school (`guardian_id`, which is how siblings share one parent) or a new
 * one typed in full.
 *
 * A block left entirely empty is dropped on submit, not rejected — the
 * alternative is a form that refuses to save because of fields the user never
 * meant to fill in. A HALF-filled block is a different thing: it is a typo, and
 * it is reported on the exact field that is missing.
 */
const guardianSchema = z
  .object({
    /** Set when an existing guardian was picked; the typed fields then mirror it. */
    guardian_id: dbId().nullish(),
    first_name: z.string().trim(),
    last_name: z.string().trim(),
    contact_number: z.string().trim().max(40).optional(),
    email: z.string().trim().max(120).optional(),
    relationship: z.enum([
      "Mother",
      "Father",
      "Grandparent",
      "Legal Guardian",
      "Sibling",
      "Guardian",
      "Other",
    ]),
  })
  .superRefine((g, ctx) => {
    // A linked guardian carries its own details; nothing here is being typed.
    if (g.guardian_id) return;

    const touched = [g.first_name, g.last_name, g.contact_number, g.email].some(
      (v) => v && v.length > 0,
    );
    if (!touched) return;

    if (!g.first_name) {
      ctx.addIssue({
        code: "custom",
        path: ["first_name"],
        message: "Guardian first name is required.",
      });
    }
    if (!g.last_name) {
      ctx.addIssue({
        code: "custom",
        path: ["last_name"],
        message: "Guardian last name is required.",
      });
    }
  });

export const newStudentSchema = z.object({
  schoolYearId: dbId(),
  lrn: z
    .string()
    .trim()
    .regex(/^\d{12}$/, "An LRN is exactly 12 digits.")
    .optional()
    .or(z.literal("")),
  first_name: z.string().trim().min(1, "First name is required."),
  middle_name: z.string().trim().optional(),
  last_name: z.string().trim().min(1, "Last name is required."),
  suffix: z.string().trim().max(10).optional(),
  birth_date: z.string().optional(),
  sex: z.enum(["M", "F"]).optional(),
  grade_level: z.string().min(1, "Choose a grade level."),
  section_id: dbId().optional().nullable(),
  student_number: z.string().trim().max(40).optional(),
  guardian: guardianSchema,
});

export type NewStudentInput = z.infer<typeof newStudentSchema>;
export type NewStudentGuardianInput = NewStudentInput["guardian"];

/**
 * Editing an existing student.
 *
 * Same shape as registration minus the school year, plus the two fields that
 * only exist once a student is on the roll: their record status and the id of
 * the row being changed.
 *
 * The guardian block differs from `newStudentSchema`'s in one way. There, a
 * `guardian_id` means "linked, nothing typed" and the names go unchecked.
 * Here the names ARE the linked guardian's, shown for correction — so an
 * emptied one is a mistake, not an omission, and is reported.
 */
const editGuardianSchema = z
  .object({
    /** The guardian already on file, when there is one. */
    guardian_id: dbId().nullish(),
    first_name: z.string().trim(),
    last_name: z.string().trim(),
    contact_number: z.string().trim().max(40).optional(),
    email: z.string().trim().max(120).optional(),
    relationship: z.enum([
      "Mother",
      "Father",
      "Grandparent",
      "Legal Guardian",
      "Sibling",
      "Guardian",
      "Other",
    ]),
  })
  .superRefine((g, ctx) => {
    const touched = [g.first_name, g.last_name, g.contact_number, g.email].some(
      (v) => v && v.length > 0,
    );
    // No guardian on file and nothing typed: a student the office has not got
    // the parent's details for yet. Dropped on save, not rejected.
    if (!g.guardian_id && !touched) return;

    if (!g.first_name) {
      ctx.addIssue({
        code: "custom",
        path: ["first_name"],
        message: "Guardian first name is required.",
      });
    }
    if (!g.last_name) {
      ctx.addIssue({
        code: "custom",
        path: ["last_name"],
        message: "Guardian last name is required.",
      });
    }
  });

export const editStudentSchema = z.object({
  student_id: dbId(),
  schoolYearId: dbId(),
  lrn: z
    .string()
    .trim()
    .regex(/^\d{12}$/, "An LRN is exactly 12 digits.")
    .optional()
    .or(z.literal("")),
  first_name: z.string().trim().min(1, "First name is required."),
  middle_name: z.string().trim().optional(),
  last_name: z.string().trim().min(1, "Last name is required."),
  suffix: z.string().trim().max(10).optional(),
  birth_date: z.string().optional(),
  sex: z.enum(["M", "F"]).optional(),
  status: z.enum(["active", "inactive", "graduated", "transferred_out"]),
  grade_level: z.string().min(1, "Choose a grade level."),
  section_id: dbId().optional().nullable(),
  student_number: z.string().trim().max(40).optional(),
  guardian: editGuardianSchema,
});

export type EditStudentInput = z.infer<typeof editStudentSchema>;
export type EditStudentGuardianInput = EditStudentInput["guardian"];
