"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Users } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  RequiredMark,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  StudentsTable,
  studentDisplayName,
  type StudentRow,
} from "@/components/tables/students-table";
import { updateStudent } from "@/app/actions/students";
import { editStudentSchema, type EditStudentInput } from "@/lib/validations/students";
import { RELATIONSHIPS } from "@/lib/import/parse";
import type { GradeLevel, Section, StudentStatus } from "@/types/database.types";

const NONE = "__none__";

const STATUSES: { value: StudentStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "graduated", label: "Graduated" },
  { value: "transferred_out", label: "Transferred out" },
];

/**
 * The student roll plus its row editor.
 *
 * A thin client shell around the table: the page stays a server component and
 * hands the rows down, and only the dialog's open row lives in state.
 */
export function StudentManager({
  rows,
  filters,
  canManage,
  schoolYearId,
  gradeLevels,
  sections,
}: {
  rows: StudentRow[];
  filters?: React.ReactNode;
  canManage: boolean;
  schoolYearId: string;
  gradeLevels: GradeLevel[];
  sections: Section[];
}) {
  const [editing, setEditing] = useState<StudentRow | null>(null);

  return (
    <>
      <StudentsTable
        rows={rows}
        filters={filters}
        onEdit={canManage ? setEditing : undefined}
      />
      <EditStudentDialog
        row={editing}
        schoolYearId={schoolYearId}
        gradeLevels={gradeLevels}
        sections={sections}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      />
    </>
  );
}

function EditStudentDialog({
  row,
  schoolYearId,
  gradeLevels,
  sections,
  onOpenChange,
}: {
  row: StudentRow | null;
  schoolYearId: string;
  gradeLevels: GradeLevel[];
  sections: Section[];
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const form = useForm<EditStudentInput>({
    resolver: zodResolver(editStudentSchema),
    mode: "onTouched",
    defaultValues: defaultsFor(row, schoolYearId),
  });

  // Re-seed when a different row is opened. Done during render rather than in
  // an effect so the dialog never paints the previous student's details first.
  const [seeded, setSeeded] = useState<string | null>(null);
  const seed = row?.student_id ?? null;
  if (seed !== seeded) {
    setSeeded(seed);
    if (row) form.reset(defaultsFor(row, schoolYearId));
  }

  const gradeLevel = form.watch("grade_level");
  const sectionsForGrade = sections.filter((s) => s.grade_level === gradeLevel);
  const siblings = row?.guardian?.sibling_count ?? 0;

  function onSubmit(values: EditStudentInput) {
    startTransition(async () => {
      const result = await updateStudent({
        ...values,
        birth_date: values.birth_date || undefined,
      });

      if (!result.ok) {
        // Duplicate LRN and duplicate student number are the two collisions the
        // database owns and can be pointed at a field. Everything else is a
        // whole-form problem.
        const field = /lrn/i.test(result.error)
          ? "lrn"
          : /student number/i.test(result.error)
            ? "student_number"
            : "root";
        form.setError(field, { message: result.error });
        return;
      }

      toast.success("Student updated.");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={row !== null} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90svh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit student</DialogTitle>
          <DialogDescription>
            {row ? studentDisplayName(row) : ""} — corrections here change the
            record, not the ledger. Charges, payments and balances are
            untouched.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
            className="flex min-h-0 flex-1 flex-col gap-4"
          >
            <div className="-mx-1 min-w-0 flex-1 space-y-6 overflow-y-auto px-1">
              <section className="space-y-4">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Student
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="first_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          First name <RequiredMark />
                        </FormLabel>
                        <FormControl>
                          <Input autoComplete="off" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="last_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Last name <RequiredMark />
                        </FormLabel>
                        <FormControl>
                          <Input autoComplete="off" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="middle_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Middle name</FormLabel>
                        <FormControl>
                          <Input
                            autoComplete="off"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="suffix"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Suffix</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Jr., III"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lrn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>LRN</FormLabel>
                        <FormControl>
                          <Input
                            inputMode="numeric"
                            placeholder="12 digits"
                            className="font-mono"
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value.replace(/\D/g, "").slice(0, 12),
                              )
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="birth_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Birth date</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="sex"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sex</FormLabel>
                        <Select
                          value={field.value ?? NONE}
                          onValueChange={(v) =>
                            field.onChange(v === NONE ? undefined : v)
                          }
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Not specified" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={NONE}>Not specified</SelectItem>
                            <SelectItem value="M">Male</SelectItem>
                            <SelectItem value="F">Female</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {STATUSES.map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Enrollment
                </h3>
                <div className="grid gap-4 sm:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="grade_level"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Grade level <RequiredMark />
                        </FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={(v) => {
                            field.onChange(v);
                            // A section belongs to exactly one grade, so
                            // changing the grade must drop a now-impossible one.
                            form.setValue("section_id", null);
                          }}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {gradeLevels.map((g) => (
                              <SelectItem key={g.code} value={g.code}>
                                {g.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="section_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Section</FormLabel>
                        <Select
                          value={field.value ?? NONE}
                          onValueChange={(v) =>
                            field.onChange(v === NONE ? null : v)
                          }
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="No section" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={NONE}>No section</SelectItem>
                            {sectionsForGrade.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {sectionsForGrade.length === 0 && (
                          <FormDescription>
                            No sections defined for {gradeLevel}.
                          </FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="student_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Student number</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="2026-001"
                            className="font-mono"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Parent / Guardian
                </h3>

                {siblings > 0 && (
                  <p className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                    <Users className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      This parent is also on file for {siblings} other{" "}
                      {siblings === 1 ? "student" : "students"}. Changes here
                      apply to all of them.
                    </span>
                  </p>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="guardian.first_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First name</FormLabel>
                        <FormControl>
                          <Input autoComplete="off" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="guardian.last_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last name</FormLabel>
                        <FormControl>
                          <Input autoComplete="off" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="guardian.contact_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact number</FormLabel>
                        <FormControl>
                          <Input
                            inputMode="tel"
                            placeholder="09171234567"
                            className="font-mono"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="guardian.email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="guardian.relationship"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Relationship</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {RELATIONSHIPS.map((r) => (
                              <SelectItem key={r} value={r}>
                                {r}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </section>
            </div>

            {form.formState.errors.root && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
              >
                {form.formState.errors.root.message}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function defaultsFor(
  row: StudentRow | null,
  schoolYearId: string,
): EditStudentInput {
  const g = row?.guardian ?? null;
  return {
    student_id: row?.student_id ?? "",
    schoolYearId,
    lrn: row?.lrn ?? "",
    first_name: row?.first_name ?? "",
    middle_name: row?.middle_name ?? "",
    last_name: row?.last_name ?? "",
    suffix: row?.suffix ?? "",
    birth_date: row?.birth_date ?? "",
    sex: row?.sex ?? undefined,
    status: row?.student_status ?? "active",
    grade_level: row?.grade_level ?? "",
    section_id: row?.section_id ?? null,
    student_number: row?.student_number ?? "",
    guardian: {
      guardian_id: g?.guardian_id ?? null,
      first_name: g?.first_name ?? "",
      last_name: g?.last_name ?? "",
      contact_number: g?.contact_number ?? "",
      email: g?.email ?? "",
      relationship: (g?.relationship as EditStudentInput["guardian"]["relationship"]) ?? "Mother",
    },
  };
}
