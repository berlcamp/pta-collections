"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Pencil, Plus, Target } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/common/empty-state";
import { ProgramProgressCard } from "./program-progress";
import { parseMoneyInput } from "@/lib/financial/money";
import { saveProgram } from "@/app/actions/donations";
import type {
  DonationProgram,
  ProgramCategory,
  ProgramStatus,
  ProgramTotals,
} from "@/types/database.types";

const CATEGORIES: { value: ProgramCategory; label: string; hint: string }[] = [
  { value: "activity", label: "Activity", hint: "Brigada Eskwela, a fun run, a fiesta" },
  { value: "project", label: "Project", hint: "A covered court, a library, equipment" },
  { value: "program", label: "Program", hint: "An ongoing PTA program" },
  { value: "fund", label: "Fund", hint: "A general or emergency fund" },
  { value: "other", label: "Other", hint: "Anything else" },
];

const STATUSES: { value: ProgramStatus; label: string; hint: string }[] = [
  { value: "planned", label: "Planned", hint: "Not yet accepting donations" },
  { value: "open", label: "Open", hint: "Accepting donations and pledges" },
  { value: "closed", label: "Closed", hint: "History is kept; nothing new is taken" },
  { value: "cancelled", label: "Cancelled", hint: "Called off" },
];

/**
 * A target is optional — a general fund legitimately has none — but a blank
 * string is not the same as "no target", so the field is free text and the
 * empty case is mapped to null on the way out.
 */
const formSchema = z
  .object({
    name: z.string().trim().min(3, "Give the program a name.").max(150),
    description: z.string().trim().max(1000),
    category: z.enum(["program", "activity", "project", "fund", "other"]),
    target_amount: z
      .string()
      .refine(
        (v) => v.trim() === "" || parseMoneyInput(v) > 0,
        "Enter a target greater than zero, or leave it blank.",
      ),
    starts_on: z.string(),
    ends_on: z.string(),
    status: z.enum(["planned", "open", "closed", "cancelled"]),
    accepts_pledges: z.boolean(),
    accepts_in_kind: z.boolean(),
  })
  .refine(
    (v) => !v.starts_on || !v.ends_on || v.ends_on >= v.starts_on,
    { message: "The end date cannot be before the start date.", path: ["ends_on"] },
  );

type ProgramValues = z.infer<typeof formSchema>;

export function ProgramManager({
  schoolYearId,
  programs,
  totals,
  canManage,
}: {
  schoolYearId: string;
  programs: DonationProgram[];
  totals: ProgramTotals[];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<DonationProgram | null>(null);
  const [open, setOpen] = useState(false);

  const totalsById = new Map(totals.map((t) => [t.program_id, t]));

  function openNew() {
    setEditing(null);
    setOpen(true);
  }

  if (programs.length === 0) {
    return (
      <>
        <EmptyState
          icon={Target}
          title="No programs yet"
          description="A program is what a donation is for — Brigada Eskwela, a covered court fund, a Recognition Day. Create one and the school can start accepting donations against it."
          action={
            canManage ? (
              <Button onClick={openNew}>
                <Plus className="size-4" />
                Create the first program
              </Button>
            ) : undefined
          }
        />
        <ProgramDialog
          open={open}
          onOpenChange={setOpen}
          program={null}
          schoolYearId={schoolYearId}
        />
      </>
    );
  }

  return (
    <>
      {canManage && (
        <div className="mb-4 flex justify-end">
          <Button onClick={openNew}>
            <Plus className="size-4" />
            New program
          </Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {programs.map((p) => {
          const t = totalsById.get(p.id);
          if (!t) return null;
          return (
            <ProgramProgressCard
              key={p.id}
              totals={t}
              href={`/donations/programs/${p.id}`}
              // Handed to the card so it sits beside the status badge. Floating
              // it over the card corner covered the badge instead.
              action={
                canManage ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      setEditing(p);
                      setOpen(true);
                    }}
                    aria-label={`Edit ${p.name}`}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                ) : undefined
              }
            />
          );
        })}
      </div>

      <ProgramDialog
        open={open}
        onOpenChange={setOpen}
        program={editing}
        schoolYearId={schoolYearId}
      />
    </>
  );
}

function defaultsFor(program: DonationProgram | null): ProgramValues {
  return {
    name: program?.name ?? "",
    description: program?.description ?? "",
    category: program?.category ?? "activity",
    target_amount:
      program?.target_amount != null ? String(program.target_amount) : "",
    starts_on: program?.starts_on ?? "",
    ends_on: program?.ends_on ?? "",
    status: program?.status ?? "open",
    accepts_pledges: program?.accepts_pledges ?? true,
    accepts_in_kind: program?.accepts_in_kind ?? true,
  };
}

function ProgramDialog({
  open,
  onOpenChange,
  program,
  schoolYearId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  program: DonationProgram | null;
  schoolYearId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const form = useForm<ProgramValues>({
    resolver: zodResolver(formSchema),
    mode: "onTouched",
    defaultValues: defaultsFor(program),
  });

  // Same re-seeding trick as the fee-type dialog: one dialog serves "new" and
  // every card's "edit", so a cancelled draft must not survive into the next.
  const [seeded, setSeeded] = useState<string | null>(null);
  const seed = open ? (program?.id ?? "new") : null;
  if (seed !== seeded) {
    setSeeded(seed);
    if (open) form.reset(defaultsFor(program));
  }

  function onSubmit(values: ProgramValues) {
    startTransition(async () => {
      const result = await saveProgram({
        id: program?.id,
        schoolYearId,
        name: values.name,
        description: values.description || null,
        category: values.category,
        target_amount: values.target_amount
          ? parseMoneyInput(values.target_amount)
          : null,
        starts_on: values.starts_on || null,
        ends_on: values.ends_on || null,
        status: values.status,
        accepts_pledges: values.accepts_pledges,
        accepts_in_kind: values.accepts_in_kind,
      });
      if (!result.ok) {
        form.setError("name", { message: result.error });
        return;
      }
      toast.success(program ? "Program updated." : "Program created.");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90svh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{program ? "Edit program" : "New program"}</DialogTitle>
          <DialogDescription>
            Donations are always recorded against a program, so the annual
            report can say what was raised and what it was for.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
            className="flex min-h-0 flex-1 flex-col gap-4"
          >
            <div className="-mx-1 min-w-0 flex-1 space-y-4 overflow-y-auto px-1">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Name <RequiredMark />
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Brigada Eskwela 2026" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full min-w-0">
                            <SelectValue>
                              {CATEGORIES.find((c) => c.value === field.value)?.label}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CATEGORIES.map((c) => (
                            <SelectItem key={c.value} value={c.value}>
                              {c.label}
                              <span className="text-muted-foreground"> — {c.hint}</span>
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
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full min-w-0">
                            <SelectValue>
                              {STATUSES.find((s) => s.value === field.value)?.label}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              {s.label}
                              <span className="text-muted-foreground"> — {s.hint}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Only an open program accepts new donations.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="target_amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fundraising target</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="decimal"
                        placeholder="50,000.00"
                        className="text-right font-mono tabular-nums"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Optional. Leave blank for an open-ended fund — the progress
                      bar is simply omitted.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="starts_on"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Starts</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="ends_on"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ends</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Description{" "}
                      <span className="font-normal text-muted-foreground">
                        (optional)
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Textarea rows={2} className="resize-none" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="accepts_in_kind"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between gap-4 rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel>Accept goods and services</FormLabel>
                      <FormDescription>
                        Cement, plywood, labour — recorded at an estimated value
                        and kept out of cash totals.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="accepts_pledges"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between gap-4 rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel>Accept pledges</FormLabel>
                      <FormDescription>
                        A parent commits an amount at an assembly and pays later.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

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
                {program ? "Save changes" : "Create program"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
