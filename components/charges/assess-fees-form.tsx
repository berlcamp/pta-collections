"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, Info, ListChecks, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatMoney } from "@/lib/financial/money";
import { assessAnnualFees } from "@/app/actions/charges";
import type { FeeType, SchoolYear } from "@/types/database.types";

const formSchema = z.object({
  schoolYearId: z.uuid(),
  feeTypeIds: z.array(z.uuid()).min(1, "Select at least one fee type."),
  dueDate: z.string(),
});

type AssessValues = z.infer<typeof formSchema>;

export function AssessFeesForm({
  schoolYears,
  currentYearId,
  feeTypes,
  enrolledCount,
}: {
  schoolYears: SchoolYear[];
  currentYearId: string;
  feeTypes: FeeType[];
  enrolledCount: number;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(
    null,
  );

  const form = useForm<AssessValues>({
    resolver: zodResolver(formSchema),
    mode: "onSubmit",
    defaultValues: {
      schoolYearId: currentYearId,
      feeTypeIds: [],
      dueDate: "",
    },
  });

  const usable = feeTypes.filter(
    (f) => f.default_amount != null && f.default_amount > 0,
  );
  const selected = form.watch("feeTypeIds");
  const chosen = usable.filter((f) => selected.includes(f.id));
  const perStudent = chosen.reduce((s, f) => s + Number(f.default_amount ?? 0), 0);

  /**
   * Submitting does not assess: it validates, then opens the confirmation.
   * Assessment writes a charge for every enrolled student in one transaction,
   * which is not something to trigger on a stray Enter key.
   */
  function onValid() {
    setConfirmOpen(true);
  }

  function assess() {
    const values = form.getValues();
    startTransition(async () => {
      const res = await assessAnnualFees({
        schoolYearId: values.schoolYearId,
        feeTypeIds: values.feeTypeIds,
        studentIds: null,
        dueDate: values.dueDate || null,
      });
      setConfirmOpen(false);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setResult(res.data);
      toast.success(
        `${res.data.created} charge${res.data.created === 1 ? "" : "s"} created.`,
      );
      router.refresh();
    });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onValid)}
        noValidate
        className="grid max-w-4xl gap-4"
      >
        <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-4 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground text-pretty">
            Assessment is <strong className="text-foreground">idempotent</strong>.
            A student can never receive the same fee twice in one school year —
            running this again only creates charges for students who were missed,
            which is exactly what you want after a batch of late enrollees.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>1. School year</CardTitle>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="schoolYearId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="sr-only">School year</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full max-w-xs">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {schoolYears.map((y) => (
                        <SelectItem key={y.id} value={y.id}>
                          {y.name}
                          {y.is_active ? " (active)" : ""}
                        </SelectItem>
                      ))}
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
            <CardTitle>2. Fee types</CardTitle>
            <CardDescription>
              Only fees with a default amount above zero can be assessed in bulk.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="feeTypeIds"
              render={({ field }) => (
                <FormItem>
                  {usable.length === 0 ? (
                    <p className="py-4 text-sm text-muted-foreground">
                      No assessable fee types. An annual or special fee needs a
                      default amount greater than zero before it can be assessed.
                    </p>
                  ) : (
                    <div className="divide-y rounded-lg border">
                      {usable.map((f) => {
                        const checked = field.value.includes(f.id);
                        return (
                          <label
                            key={f.id}
                            className="flex cursor-pointer items-center gap-3 px-3 py-3 transition-colors hover:bg-muted/50"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) =>
                                field.onChange(
                                  v
                                    ? [...field.value, f.id]
                                    : field.value.filter((x) => x !== f.id),
                                )
                              }
                            />
                            <span className="flex-1 text-sm font-medium">
                              {f.name}
                              {f.description && (
                                <span className="block text-xs font-normal text-muted-foreground">
                                  {f.description}
                                </span>
                              )}
                            </span>
                            <span className="font-mono text-sm tabular-nums">
                              {formatMoney(f.default_amount)}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              3. Due date{" "}
              <span className="text-sm font-normal text-muted-foreground">
                (optional)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="dueDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="sr-only">Due date</FormLabel>
                  <FormControl>
                    <Input type="date" className="w-48" {...field} />
                  </FormControl>
                  <FormDescription>
                    Charges past their due date are what the outstanding-dues
                    report chases.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-sm">
              <p>
                <span className="font-semibold">
                  {enrolledCount.toLocaleString()}
                </span>{" "}
                enrolled students &times;{" "}
                <span className="font-semibold">{chosen.length}</span> fee
                {chosen.length === 1 ? "" : "s"}
              </p>
              <p className="text-muted-foreground">
                {formatMoney(perStudent)} per student ·{" "}
                {formatMoney(perStudent * enrolledCount)} total if none exist yet
              </p>
            </div>
            <Button type="submit" size="lg" disabled={enrolledCount === 0}>
              <ListChecks className="size-4" />
              Assess all enrolled students
            </Button>
          </CardContent>
        </Card>

        {result && (
          <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/10 p-4 text-sm">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
            <p>
              <strong>{result.created}</strong> charge
              {result.created === 1 ? "" : "s"} created,{" "}
              <strong>{result.skipped}</strong> skipped because they already
              existed.
            </p>
          </div>
        )}

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Assess fees for {enrolledCount.toLocaleString()} students?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This creates {chosen.length} charge
                {chosen.length === 1 ? "" : "s"} per enrolled student, worth{" "}
                {formatMoney(perStudent)} each. Students who already have these
                charges are skipped automatically.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  assess();
                }}
                disabled={pending}
              >
                {pending && <Loader2 className="size-4 animate-spin" />}
                Assess fees
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </form>
    </Form>
  );
}
