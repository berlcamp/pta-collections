"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, UserRound, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { newStudentSchema, type NewStudentInput } from "@/lib/validations/students";
import { createStudent } from "@/app/actions/students";
import { GuardianPicker } from "@/components/students/guardian-picker";
import { RELATIONSHIPS } from "@/lib/import/parse";
import type { GuardianSearchResult } from "@/lib/data/guardians";
import type { GradeLevel, Section } from "@/types/database.types";

const NONE = "__none__";

export function NewStudentForm({
  schoolYearId,
  gradeLevels,
  sections,
}: {
  schoolYearId: string;
  gradeLevels: GradeLevel[];
  sections: Section[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Set when the guardian is an existing record rather than one being typed.
  const [linked, setLinked] = useState<GuardianSearchResult | null>(null);

  const form = useForm<NewStudentInput>({
    resolver: zodResolver(newStudentSchema),
    mode: "onTouched",
    defaultValues: {
      schoolYearId,
      lrn: "",
      first_name: "",
      middle_name: "",
      last_name: "",
      suffix: "",
      birth_date: "",
      grade_level: gradeLevels[0]?.code ?? "Grade 7",
      section_id: null,
      student_number: "",
      guardian: {
        guardian_id: null,
        first_name: "",
        last_name: "",
        contact_number: "",
        email: "",
        relationship: "Mother",
      },
    },
  });

  function linkGuardian(g: GuardianSearchResult) {
    setLinked(g);
    form.setValue("guardian.guardian_id", g.id);
    form.setValue("guardian.first_name", g.first_name);
    form.setValue("guardian.last_name", g.last_name);
    form.setValue("guardian.contact_number", g.contact_number ?? "");
    form.setValue("guardian.email", g.email ?? "");
    form.clearErrors("guardian");
  }

  function unlinkGuardian() {
    setLinked(null);
    form.setValue("guardian.guardian_id", null);
    form.setValue("guardian.first_name", "");
    form.setValue("guardian.last_name", "");
    form.setValue("guardian.contact_number", "");
    form.setValue("guardian.email", "");
  }

  const gradeLevel = form.watch("grade_level");
  const sectionsForGrade = sections.filter((s) => s.grade_level === gradeLevel);

  function onSubmit(values: NewStudentInput) {
    startTransition(async () => {
      // A guardian left entirely blank is not an error — it is a student
      // enrolled before the office has the parent's details. The action drops it.
      const res = await createStudent({
        ...values,
        birth_date: values.birth_date || undefined,
      });

      if (!res.ok) {
        // Duplicate LRN is the collision the database owns; everything else is
        // a whole-form problem and belongs at the top of the form.
        form.setError(/lrn/i.test(res.error) ? "lrn" : "root", {
          message: res.error,
        });
        return;
      }
      toast.success("Student enrolled.");
      router.push(`/students/${res.data.studentId}`);
    });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        noValidate
        className="max-w-3xl space-y-4"
      >
        <Card>
          <CardHeader>
            <CardTitle>Student</CardTitle>
            <CardDescription>
              Name and LRN as they appear on the DepEd record.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
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
                    <Input autoComplete="off" {...field} value={field.value ?? ""} />
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
                    <Input placeholder="Jr., III" {...field} value={field.value ?? ""} />
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
                  <FormDescription>
                    Optional, but it is what matches this student on a later CSV
                    import.
                  </FormDescription>
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
                    <Input type="date" {...field} value={field.value ?? ""} />
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Enrollment</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
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
                      // A section belongs to exactly one grade, so changing the
                      // grade must drop a now-impossible section.
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
                    onValueChange={(v) => field.onChange(v === NONE ? null : v)}
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Parent / Guardian</CardTitle>
            <CardDescription>
              One guardian per student — the contact for collection notices. If
              a sibling is already enrolled, link that same guardian rather than
              typing them in again.
            </CardDescription>
            <CardAction>
              <GuardianPicker onSelect={linkGuardian} disabled={pending} />
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {linked ? (
              <div className="flex items-start justify-between gap-4 rounded-lg border bg-muted/30 p-4 sm:col-span-2">
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <UserRound className="size-4 text-muted-foreground" />
                    {linked.first_name} {linked.last_name}
                    <Badge variant="secondary">On file</Badge>
                  </p>
                  {linked.contact_number && (
                    <p className="font-mono text-xs text-muted-foreground">
                      {linked.contact_number}
                    </p>
                  )}
                  {linked.email && (
                    <p className="text-xs break-all text-muted-foreground">
                      {linked.email}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {linked.student_count === 0
                      ? "Not linked to any student yet."
                      : `Already the guardian of ${linked.student_count} other ${
                          linked.student_count === 1 ? "student" : "students"
                        }.`}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={unlinkGuardian}
                  disabled={pending}
                >
                  <X className="size-3.5" />
                  Unlink
                </Button>
              </div>
            ) : (
              <>
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
              </>
            )}

            <FormField
              control={form.control}
              name="guardian.relationship"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Relationship</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
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
                  <FormDescription>
                    How this guardian is related to the student.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {form.formState.errors.root && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
          >
            {form.formState.errors.root.message}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Enroll student
          </Button>
        </div>
      </form>
    </Form>
  );
}
