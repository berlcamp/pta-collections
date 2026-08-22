"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/browser";
import { parseMoneyInput } from "@/lib/financial/money";
import { createPenalty } from "@/app/actions/charges";
import type { FeeType } from "@/types/database.types";

interface Hit {
  student_id: string;
  first_name: string;
  last_name: string;
  grade_level: string;
  section_name: string | null;
}

/**
 * The student is picked from a search, so it lives in the form as an id rather
 * than as free text — an empty id is a validation failure like any other, and
 * gets a message under the picker instead of a silently disabled button.
 */
const formSchema = z.object({
  studentId: z.string().min(1, "Choose the student this penalty applies to."),
  feeTypeId: z.string().min(1, "Choose a penalty type."),
  amount: z
    .string()
    .refine((v) => parseMoneyInput(v) > 0, "Enter an amount greater than zero."),
  description: z
    .string()
    .trim()
    .min(3, "Describe the reason — it appears on the student's record."),
  dueDate: z.string(),
});

type PenaltyValues = z.infer<typeof formSchema>;

export function PenaltyDialog({
  schoolId,
  schoolYearId,
  penaltyTypes,
}: {
  schoolId: string;
  schoolYearId: string;
  penaltyTypes: FeeType[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [student, setStudent] = useState<Hit | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<PenaltyValues>({
    resolver: zodResolver(formSchema),
    mode: "onTouched",
    defaultValues: {
      studentId: "",
      feeTypeId: "",
      amount: "",
      description: "",
      dueDate: "",
    },
  });

  const term = query.trim();
  // Derived rather than stored — see new-payment-flow for the same reasoning.
  const visibleHits = student || term.length < 2 ? [] : hits;

  useEffect(() => {
    if (student || term.length < 2) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const supabase = createClient();
      const escaped = term.replace(/[%,()]/g, " ");
      const { data } = await supabase
        .from("v_student_payment_status")
        .select("student_id,first_name,last_name,grade_level,section_name")
        .eq("school_id", schoolId)
        .eq("school_year_id", schoolYearId)
        .or(`first_name.ilike.%${escaped}%,last_name.ilike.%${escaped}%`)
        .limit(8);
      if (!cancelled) setHits((data ?? []) as Hit[]);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [term, student, schoolId, schoolYearId]);

  function pick(hit: Hit) {
    setStudent(hit);
    form.setValue("studentId", hit.student_id, { shouldValidate: true });
  }

  function clearStudent() {
    setStudent(null);
    setQuery("");
    form.setValue("studentId", "", { shouldValidate: true });
  }

  function onFeeTypeChange(id: string) {
    form.setValue("feeTypeId", id, { shouldValidate: true });
    const ft = penaltyTypes.find((f) => f.id === id);
    // Prefill only what the user has not already typed over.
    if (ft?.default_amount != null && !form.getValues("amount")) {
      form.setValue("amount", String(ft.default_amount));
    }
    if (ft && !form.getValues("description")) {
      form.setValue("description", ft.name);
    }
  }

  function reset() {
    setQuery("");
    setHits([]);
    setStudent(null);
    form.reset();
  }

  function onSubmit(values: PenaltyValues) {
    startTransition(async () => {
      const res = await createPenalty({
        studentId: values.studentId,
        schoolYearId,
        feeTypeId: values.feeTypeId,
        amount: parseMoneyInput(values.amount),
        description: values.description,
        dueDate: values.dueDate || null,
      });
      if (!res.ok) {
        form.setError("amount", { message: res.error });
        return;
      }
      toast.success("Penalty recorded.");
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  if (penaltyTypes.length === 0) {
    return (
      <Button disabled title="Create a fee type in the 'penalty' category first">
        <Plus className="size-4" />
        New penalty
      </Button>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          New penalty
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a penalty</DialogTitle>
          <DialogDescription>
            The penalty appears under the student&rsquo;s outstanding dues
            immediately.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="studentId"
              render={() => (
                <FormItem>
                  <FormLabel htmlFor="pen-student">
                    Student <RequiredMark />
                  </FormLabel>
                  {student ? (
                    <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                      <span className="min-w-0 truncate">
                        <span className="font-medium">
                          {student.last_name}, {student.first_name}
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {student.grade_level}
                          {student.section_name
                            ? ` · ${student.section_name}`
                            : ""}
                        </span>
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={clearStudent}
                      >
                        <X className="size-3.5" />
                        Change
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="pen-student"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Search student name…"
                          className="pl-9"
                        />
                      </div>
                      {visibleHits.length > 0 && (
                        <div className="max-h-44 overflow-y-auto rounded-lg border">
                          {visibleHits.map((h) => (
                            <button
                              key={h.student_id}
                              type="button"
                              onClick={() => pick(h)}
                              className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                            >
                              <span className="font-medium">
                                {h.last_name}, {h.first_name}
                              </span>
                              <span className="ml-2 text-xs text-muted-foreground">
                                {h.grade_level}
                                {h.section_name ? ` · ${h.section_name}` : ""}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="feeTypeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Penalty type <RequiredMark />
                  </FormLabel>
                  <Select value={field.value} onValueChange={onFeeTypeChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose a penalty type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {penaltyTypes.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Amount <RequiredMark />
                    </FormLabel>
                    <FormControl>
                      <Input
                        inputMode="decimal"
                        placeholder="100.00"
                        className="text-right font-mono tabular-nums"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Due date</FormLabel>
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
                    Reason <RequiredMark />
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      placeholder="Lost school identification card"
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Shown to the guardian on the outstanding-dues list.
                  </FormDescription>
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
                Record penalty
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
