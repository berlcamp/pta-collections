"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, Info, ListChecks, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import { formatMoney, parseMoneyInput } from "@/lib/financial/money";
import { assessAnnualFees, previewAssessScope } from "@/app/actions/charges";
import { dynamicRoute } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { FeeType, SchoolYear } from "@/types/database.types";
import { dbId } from "@/lib/validations/id";

export type ScopeGrade = {
  code: string;
  label: string;
  /** Enrolled in the grade, sectioned or not. */
  count: number;
  sections: { id: string; name: string; count: number }[];
};

type Scope = "all" | "grades" | "sections";

const formSchema = z.object({
  schoolYearId: dbId(),
  feeTypeIds: z.array(dbId()).min(1, "Select at least one fee type."),
  scope: z.enum(["all", "grades", "sections"]),
  gradeLevels: z.array(z.string()),
  sectionIds: z.array(z.string()),
  /** Typed amount per fee id; blank means "use the fee's default". */
  amounts: z.record(z.string(), z.string()),
  dueDate: z.string(),
});

type AssessValues = z.infer<typeof formSchema>;

export function AssessFeesForm({
  schoolYears,
  currentYearId,
  feeTypes,
  enrolledCount,
  grades,
}: {
  schoolYears: SchoolYear[];
  currentYearId: string;
  feeTypes: FeeType[];
  enrolledCount: number;
  grades: ScopeGrade[];
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
      scope: "all",
      gradeLevels: [],
      sectionIds: [],
      amounts: {},
      dueDate: "",
    },
  });

  const [selected, scope, gradeLevels, sectionIds, amounts] = form.watch([
    "feeTypeIds",
    "scope",
    "gradeLevels",
    "sectionIds",
    "amounts",
  ]);
  // Set once the admin picks a scope themselves, so ticking a homeroom fee
  // only suggests Sections while they have not chosen.
  const [scopeTouched, setScopeTouched] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const chosen = feeTypes.filter((f) => selected.includes(f.id));
  /** What this fee charges per student/family in this run. */
  const amountOf = (f: FeeType) => {
    const typed = (amounts[f.id] ?? "").trim();
    return typed !== "" ? parseMoneyInput(typed) : Number(f.default_amount ?? 0);
  };
  const missing = chosen.filter((f) => !(amountOf(f) > 0));
  const studentFees = chosen.filter((f) => f.billing_basis !== "per_family");
  const familyFees = chosen.filter((f) => f.billing_basis === "per_family");
  const perStudent = studentFees.reduce((s, f) => s + amountOf(f), 0);
  const perFamily = familyFees.reduce((s, f) => s + amountOf(f), 0);

  const allSections = grades.flatMap((g) =>
    g.sections.map((s) => ({ ...s, grade: g.label })),
  );
  const targetCount =
    scope === "all"
      ? enrolledCount
      : scope === "grades"
        ? grades
            .filter((g) => gradeLevels.includes(g.code))
            .reduce((s, g) => s + g.count, 0)
        : allSections
            .filter((s) => sectionIds.includes(s.id))
            .reduce((s, x) => s + x.count, 0);

  // Families are computed in SQL (pta.student_families, 0028) — the same
  // function the assessment uses, so the preview cannot disagree with it.
  const [families, setFamilies] = useState<number | null>(null);
  const scopeKey = `${scope}|${gradeLevels.join(",")}|${sectionIds.join(",")}`;
  const wantsFamilies = familyFees.length > 0;
  const yearId = form.watch("schoolYearId");
  useEffect(() => {
    if (!wantsFamilies) return;
    let live = true;
    setFamilies(null);
    const [sc, g, sec] = scopeKey.split("|");
    void previewAssessScope({
      schoolYearId: yearId,
      gradeLevels: sc === "grades" && g ? g.split(",") : null,
      sectionIds: sc === "sections" && sec ? sec.split(",") : null,
    }).then((res) => {
      if (live && res.ok) setFamilies(res.data.families);
    });
    return () => {
      live = false;
    };
  }, [scopeKey, wantsFamilies, yearId]);
  const familyCount = families ?? 0;
  const grandTotal = perStudent * targetCount + perFamily * familyCount;

  const scopeLabel =
    scope === "all"
      ? "the whole school"
      : scope === "grades"
        ? grades
            .filter((g) => gradeLevels.includes(g.code))
            .map((g) => g.label)
            .join(", ")
        : allSections
            .filter((s) => sectionIds.includes(s.id))
            .map((s) => `${s.grade} ${s.name}`)
            .join(", ");

  const scopeEmpty =
    (scope === "grades" && gradeLevels.length === 0) ||
    (scope === "sections" && sectionIds.length === 0);

  /**
   * Submitting does not assess: it validates, then opens the confirmation.
   * Assessment writes a charge for every targeted student in one transaction,
   * which is not something to trigger on a stray Enter key.
   */
  function onValid() {
    if (scopeEmpty) {
      toast.error(scope === "grades" ? "Pick at least one grade." : "Pick at least one section.");
      return;
    }
    if (missing.length > 0) {
      setShowErrors(true);
      toast.error(`Enter an amount for ${missing.map((f) => f.name).join(", ")}.`);
      return;
    }
    setConfirmOpen(true);
  }

  function assess() {
    const v = form.getValues();
    startTransition(async () => {
      const res = await assessAnnualFees({
        schoolYearId: v.schoolYearId,
        items: chosen.map((f) => ({
          feeTypeId: f.id,
          // Sent only when typed, so "use the default" stays the server's call.
          amount: (v.amounts[f.id] ?? "").trim() !== "" ? amountOf(f) : null,
        })),
        gradeLevels: v.scope === "grades" ? v.gradeLevels : null,
        sectionIds: v.scope === "sections" ? v.sectionIds : null,
        dueDate: v.dueDate || null,
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

  function toggle(list: string[], id: string, on: boolean) {
    return on ? [...list, id] : list.filter((x) => x !== id);
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
                  <Select
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v);
                      // Sections belong to a year; reload them for the new one.
                      router.push(dynamicRoute(`/charges/assess?sy=${v}`));
                    }}
                  >
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
              Tick the fees to charge. Each one&apos;s amount can be changed for this
              run; a fee with no default — usually a homeroom contribution — needs
              one typed in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="feeTypeIds"
              render={({ field }) => (
                <FormItem>
                  {feeTypes.length === 0 ? (
                    <p className="py-4 text-sm text-muted-foreground">
                      No assessable fee types. Add an annual, special or homeroom
                      fee under Charges → Fee types first.
                    </p>
                  ) : (
                    <div className="divide-y rounded-lg border">
                      {feeTypes.map((f) => {
                        const checked = field.value.includes(f.id);
                        const hasDefault = Number(f.default_amount) > 0;
                        const invalid = checked && showErrors && !(amountOf(f) > 0);
                        return (
                          <div
                            key={f.id}
                            className={cn(
                              "flex flex-wrap items-center gap-3 px-3 py-3 transition-colors sm:flex-nowrap",
                              checked && "bg-muted/40",
                            )}
                          >
                            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(v) => {
                                  field.onChange(toggle(field.value, f.id, Boolean(v)));
                                  // A homeroom fee is almost always for one room.
                                  if (v && f.category === "homeroom" && !scopeTouched) {
                                    form.setValue("scope", "sections");
                                  }
                                }}
                              />
                              <span className="min-w-0 flex-1 text-sm font-medium">
                                {f.name}
                                {f.billing_basis === "per_family" && (
                                  <Badge variant="outline" className="ml-2 align-middle">
                                    Once per family
                                  </Badge>
                                )}
                                {f.category === "homeroom" && (
                                  <Badge variant="secondary" className="ml-2 align-middle">
                                    Homeroom
                                  </Badge>
                                )}
                                {f.description && (
                                  <span className="block text-xs font-normal text-muted-foreground">
                                    {f.description}
                                  </span>
                                )}
                              </span>
                            </label>
                            {checked ? (
                              <div className="ml-7 flex items-center gap-1.5 sm:ml-0">
                                <span className="text-sm text-muted-foreground">₱</span>
                                <Input
                                  aria-label={`Amount for ${f.name}`}
                                  aria-invalid={invalid || undefined}
                                  inputMode="decimal"
                                  autoComplete="off"
                                  placeholder={hasDefault ? Number(f.default_amount).toFixed(2) : "Amount"}
                                  className={cn(
                                    "h-9 w-32 text-right font-mono tabular-nums",
                                    invalid && "border-destructive ring-1 ring-destructive",
                                  )}
                                  value={amounts[f.id] ?? ""}
                                  onChange={(e) =>
                                    form.setValue(`amounts.${f.id}`, e.target.value)
                                  }
                                />
                              </div>
                            ) : (
                              <span
                                className={cn(
                                  "font-mono text-sm tabular-nums",
                                  !hasDefault && "text-xs text-muted-foreground",
                                )}
                              >
                                {hasDefault ? formatMoney(f.default_amount) : "Set amount"}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {showErrors && missing.length > 0 && (
              <p className="mt-3 text-sm text-destructive">
                Enter an amount for {missing.map((f) => f.name).join(", ")}.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. Who to charge</CardTitle>
            <CardDescription>
              Only students currently enrolled in this school year are charged.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="scope"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="sr-only">Scope</FormLabel>
                  <div
                    role="radiogroup"
                    className="inline-flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1"
                  >
                    {(
                      [
                        ["all", "Whole school"],
                        ["grades", "Grades"],
                        ["sections", "Sections"],
                      ] as [Scope, string][]
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={field.value === value}
                        onClick={() => {
                          setScopeTouched(true);
                          field.onChange(value);
                        }}
                        className={cn(
                          "h-9 rounded-md px-4 text-sm font-medium transition-colors",
                          field.value === value
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </FormItem>
              )}
            />

            {scope === "grades" && (
              <FormField
                control={form.control}
                name="gradeLevels"
                render={({ field }) => (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {grades.map((g) => (
                      <label
                        key={g.code}
                        className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={field.value.includes(g.code)}
                          onCheckedChange={(v) =>
                            field.onChange(toggle(field.value, g.code, Boolean(v)))
                          }
                        />
                        <span className="flex-1 text-sm font-medium">{g.label}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {g.count}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              />
            )}

            {scope === "sections" &&
              (allSections.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This school year has no sections yet. Add them under
                  Administration → Sections.
                </p>
              ) : (
                <FormField
                  control={form.control}
                  name="sectionIds"
                  render={({ field }) => (
                    <div className="space-y-4">
                      {grades
                        .filter((g) => g.sections.length > 0)
                        .map((g) => (
                          <div key={g.code}>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {g.label}
                            </p>
                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                              {g.sections.map((s) => (
                                <label
                                  key={s.id}
                                  className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 hover:bg-muted/50"
                                >
                                  <Checkbox
                                    checked={field.value.includes(s.id)}
                                    onCheckedChange={(v) =>
                                      field.onChange(toggle(field.value, s.id, Boolean(v)))
                                    }
                                  />
                                  <span className="flex-1 text-sm font-medium">{s.name}</span>
                                  <span className="text-xs tabular-nums text-muted-foreground">
                                    {s.count}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                />
              ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              4. Due date{" "}
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
            <div className="space-y-0.5 text-sm">
              {(studentFees.length > 0 || familyFees.length === 0) && (
                <p>
                  <span className="font-semibold">{targetCount.toLocaleString()}</span>{" "}
                  student{targetCount === 1 ? "" : "s"} &times;{" "}
                  {formatMoney(perStudent)}
                </p>
              )}
              {familyFees.length > 0 && (
                <p>
                  <span className="font-semibold">
                    {families == null ? "…" : familyCount.toLocaleString()}
                  </span>{" "}
                  famil{familyCount === 1 ? "y" : "ies"} &times; {formatMoney(perFamily)}
                  <span className="text-muted-foreground">
                    {" "}
                    · eldest child only, out of {targetCount.toLocaleString()} students
                  </span>
                </p>
              )}
              <p className="text-muted-foreground">
                {formatMoney(grandTotal)} total if none exist yet
              </p>
            </div>
            <Button
              type="submit"
              size="lg"
              disabled={targetCount === 0 || chosen.length === 0}
            >
              <ListChecks className="size-4" />
              {scope === "all" ? "Assess all enrolled students" : "Assess selected"}
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
                Assess {targetCount.toLocaleString()} student
                {targetCount === 1 ? "" : "s"}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This charges {scopeLabel}
                {studentFees.length > 0 &&
                  ` ${formatMoney(perStudent)} per student`}
                {studentFees.length > 0 && familyFees.length > 0 && " and"}
                {familyFees.length > 0 &&
                  ` ${formatMoney(perFamily)} per family, on the eldest child`}
                . Anyone already charged is skipped and keeps their existing
                amount; a family already charged through any child is not charged
                again.
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
