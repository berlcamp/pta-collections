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
