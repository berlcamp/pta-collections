"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { dynamicRoute } from "@/lib/routes";
import { BookUser, Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import {
  Form,
  FormControl,
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
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/empty-state";
import { sectionSchema } from "@/lib/validations/admin";
import { saveSection } from "@/app/actions/admin";
import type { GradeLevel, SchoolYear, Section } from "@/types/database.types";

// The school year comes from the page's own picker, not from this form.
const formSchema = sectionSchema.omit({ id: true, school_year_id: true });
type SectionValues = z.infer<typeof formSchema>;

export function SectionManager({
  sections,
  gradeLevels,
  schoolYears,
  currentYearId,
}: {
  sections: Section[];
  gradeLevels: GradeLevel[];
  schoolYears: SchoolYear[];
  currentYearId: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  // The section being renamed; null while creating a new one.
  const [editing, setEditing] = useState<Section | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<SectionValues>({
    resolver: zodResolver(formSchema),
    mode: "onTouched",
    defaultValues: {
      grade_level: gradeLevels[0]?.code ?? "Grade 7",
      name: "",
    },
  });

  const byGrade = gradeLevels
    .map((g) => ({
      grade: g,
      items: sections.filter((s) => s.grade_level === g.code),
    }))
    .filter((g) => g.items.length > 0);

  function changeYear(v: string) {
    const next = new URLSearchParams(params.toString());
    next.set("sy", v);
    router.push(dynamicRoute(`/admin/sections?${next.toString()}`));
  }

  function openNew() {
    setEditing(null);
    form.reset({ grade_level: gradeLevels[0]?.code ?? "Grade 7", name: "" });
    setOpen(true);
  }

  function openEdit(section: Section) {
    setEditing(section);
    form.reset({ grade_level: section.grade_level, name: section.name });
    setOpen(true);
  }

  function onSubmit(values: SectionValues) {
    startTransition(async () => {
      const res = await saveSection({
        id: editing?.id,
        school_year_id: currentYearId,
        ...values,
        // A section's grade is fixed once created: its students are enrolled
        // in that grade, and moving the section would leave each of them in
        // a section of a grade they are not in.
        grade_level: editing ? editing.grade_level : values.grade_level,
      });
      if (!res.ok) {
        // A duplicate section name within a grade is the database's call.
        form.setError("name", { message: res.error });
        return;
      }
      toast.success(editing ? "Section renamed." : "Section created.");
      setOpen(false);
      setEditing(null);
      form.reset();
      router.refresh();
    });
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Select value={currentYearId} onValueChange={changeYear}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {schoolYears.map((y) => (
              <SelectItem key={y.id} value={y.id}>
                {y.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={openNew}>
          <Plus className="size-4" />
          New section
        </Button>
      </div>

      {sections.length === 0 ? (
        <EmptyState
          icon={BookUser}
          title="No sections yet"
          description="Add the sections for this school year, or let the CSV importer propose them during an import."
          action={<Button onClick={openNew}>Add a section</Button>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {byGrade.map(({ grade: g, items }) => (
            <Card key={g.code}>
              <CardContent className="p-4">
                <p className="mb-2 text-sm font-semibold">{g.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => openEdit(s)}
                      aria-label={`Edit ${g.label} ${s.name}`}
                      className="group rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <Badge
                        variant="secondary"
                        className="gap-1 transition-colors group-hover:bg-primary/10"
                      >
                        {s.name}
                        <Pencil className="size-3 opacity-50 group-hover:opacity-100" />
                      </Badge>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            form.reset();
            setEditing(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit section" : "New section"}</DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              noValidate
              className="space-y-4"
            >
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
                      onValueChange={field.onChange}
                      disabled={Boolean(editing)}
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
                    {editing && (
                      <p className="text-xs text-muted-foreground">
                        A section stays in its grade. To move students, change
                        their enrollment instead.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Section name <RequiredMark />
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Section A / Rizal / Sampaguita"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="size-4 animate-spin" />}
                  {editing ? "Save" : "Create section"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
