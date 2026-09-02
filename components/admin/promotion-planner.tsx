"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  GraduationCap,
  Loader2,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { dynamicRoute } from "@/lib/routes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroller } from "@/components/common/data-table";
import { promoteStudents } from "@/app/actions/admin";
import type { GradeLevel, SchoolYear } from "@/types/database.types";

export interface PromotionPlanRow {
  from_grade: string;
  /** null when this grade graduates rather than moving up. */
  to_grade: string | null;
  eligible: number;
  already_enrolled: number;
  to_promote: number;
  with_balance: number;
}

export function PromotionPlanner({
  schoolYears,
  targetOptions,
  fromYearId,
  toYearId,
  exitGrade,
  exitGradeExplicit,
  gradeLevels,
  plan,
}: {
  schoolYears: SchoolYear[];
  targetOptions: SchoolYear[];
  fromYearId: string;
  toYearId: string | null;
  exitGrade: string | null;
  /** True when the admin picked the exit grade rather than inheriting it. */
  exitGradeExplicit: boolean;
  gradeLevels: GradeLevel[];
  plan: PromotionPlanRow[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [navigating, startNavigation] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function push(mutate: (p: URLSearchParams) => void) {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    startNavigation(() => {
      router.push(
        dynamicRoute(`/admin/school-years/promote?${next.toString()}`),
      );
    });
  }

  const fromYear = schoolYears.find((y) => y.id === fromYearId);
  const toYear = schoolYears.find((y) => y.id === toYearId);

  const totals = plan.reduce(
    (acc, r) => ({
      eligible: acc.eligible + r.eligible,
      promote: acc.promote + r.to_promote,
      graduate: acc.graduate + (r.to_grade === null ? r.eligible : 0),
      carried: acc.carried + r.already_enrolled,
      owing: acc.owing + r.with_balance,
    }),
    { eligible: 0, promote: 0, graduate: 0, carried: 0, owing: 0 },
  );

  const graduatingOwing = plan
    .filter((r) => r.to_grade === null)
    .reduce((n, r) => n + r.with_balance, 0);

  const nothingToDo = totals.promote === 0 && totals.graduate === 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Which years</CardTitle>
          <CardDescription>
            Everyone enrolled in the source year moves up one grade in the
            target year. The target does not have to be the active year yet —
            you can promote first and switch over later.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="from-year">Promote from</Label>
            <Select
              value={fromYearId}
              onValueChange={(v) =>
                push((p) => {
                  p.set("from", v);
                  // The target and the exit grade were chosen against the old
                  // source year; neither survives changing it.
                  p.delete("to");
                  p.delete("exit");
                })
              }
            >
              <SelectTrigger id="from-year" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {schoolYears.map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.name}
                    {y.is_active ? " · active" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="to-year">Promote into</Label>
            <Select
              value={toYearId ?? ""}
              onValueChange={(v) => push((p) => p.set("to", v))}
              disabled={targetOptions.length === 0}
            >
              <SelectTrigger id="to-year" className="w-full">
                <SelectValue placeholder="No later year exists" />
              </SelectTrigger>
              <SelectContent>
                {targetOptions.map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {targetOptions.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Only a year starting after {fromYear?.name} can be a target.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="exit-grade">Graduating grade</Label>
            <Select
              value={exitGrade ?? ""}
              onValueChange={(v) => push((p) => p.set("exit", v))}
            >
              <SelectTrigger id="exit-grade" className="w-full">
                <SelectValue placeholder="Nothing enrolled" />
              </SelectTrigger>
              <SelectContent>
                {gradeLevels.map((g) => (
                  <SelectItem key={g.code} value={g.code}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {exitGradeExplicit
                ? "Students in this grade leave the school instead of moving up."
                : "Defaulted to the highest grade this year taught. Change it if your school ends earlier."}
            </p>
          </div>
        </CardContent>
      </Card>

      {toYear && (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {fromYear?.name}
              <ArrowRight className="size-4 text-muted-foreground" />
              {toYear.name}
            </CardTitle>
            <CardDescription>
              Nothing below has happened yet. This is what the button would do.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {plan.length === 0 ? (
              <p className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                Nobody is enrolled in {fromYear?.name}, so there is nothing to
                promote.
              </p>
            ) : (
              <TableScroller>
                <Table>
                  <TableHeader className="bg-muted/60">
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Grade</TableHead>
                      <TableHead>Becomes</TableHead>
                      <TableHead className="text-right">Enrolled</TableHead>
                      <TableHead className="text-right">Already carried</TableHead>
                      <TableHead className="text-right">To move</TableHead>
                      <TableHead className="text-right">Still owing</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plan.map((r) => (
                      <TableRow key={r.from_grade}>
                        <TableCell className="font-medium">
                          {r.from_grade}
                        </TableCell>
                        <TableCell>
                          {r.to_grade ? (
                            <span className="flex items-center gap-1.5">
                              <ArrowRight className="size-3.5 text-muted-foreground" />
                              {r.to_grade}
                            </span>
                          ) : (
                            <Badge variant="secondary" className="gap-1">
                              <GraduationCap className="size-3" />
                              Graduates
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.eligible}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {r.already_enrolled || "—"}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {r.to_grade ? r.to_promote : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {r.with_balance || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={2} className="font-medium">
                        Total
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {totals.eligible}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {totals.carried || "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {totals.promote}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {totals.owing || "—"}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </TableScroller>
            )}

            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>
                  Promoted students arrive with <strong>no section</strong>.
                  Sections belong to one grade in one year, so the target year
                  needs its own — assign them under Administration → Sections
                  afterwards.
                </span>
              </p>
              {graduatingOwing > 0 && (
                <p className="flex items-start gap-2">
                  <Wallet className="mt-0.5 size-4 shrink-0" />
                  <span>
                    {graduatingOwing}{" "}
                    {graduatingOwing === 1 ? "student" : "students"} in the
                    graduating grade still{" "}
                    {graduatingOwing === 1 ? "owes" : "owe"} on{" "}
                    {fromYear?.name}. Nothing is written off — but marking them
                    graduated moves those dues behind the{" "}
                    <strong>include inactive</strong> toggle on the outstanding
                    dues report.
                  </span>
                </p>
              )}
              <p className="flex items-start gap-2">
                <Wallet className="mt-0.5 size-4 shrink-0" />
                <span>
                  No fees are assessed for {toYear.name}. Promotion moves
                  students; charging them is a separate step under Charges →
                  Assess annual fees.
                </span>
              </p>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={() => setConfirming(true)}
                disabled={nothingToDo || navigating}
              >
                {navigating && <Loader2 className="size-4 animate-spin" />}
                {nothingToDo
                  ? "Nothing to promote"
                  : `Promote ${totals.promote} and graduate ${totals.graduate}`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        fromName={fromYear?.name ?? ""}
        toName={toYear?.name ?? ""}
        fromYearId={fromYearId}
        toYearId={toYearId}
        exitGrade={exitGrade}
        promote={totals.promote}
        graduate={totals.graduate}
      />
    </div>
  );
}

function ConfirmDialog({
  open,
  onOpenChange,
  fromName,
  toName,
  fromYearId,
  toYearId,
  exitGrade,
  promote,
  graduate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  fromName: string;
  toName: string;
  fromYearId: string;
  toYearId: string | null;
  exitGrade: string | null;
  promote: number;
  graduate: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    if (!toYearId) return;
    setError(null);
    startTransition(async () => {
      const res = await promoteStudents({
        fromYearId,
        toYearId,
        exitGrade,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(
        `${res.data.promoted} promoted into ${toName}, ${res.data.graduated} graduated.`,
      );
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Promote {fromName} into {toName}?</DialogTitle>
          <DialogDescription>
            {promote} {promote === 1 ? "student moves" : "students move"} up a
            grade
            {graduate > 0 && (
              <>
                {" "}
                and {graduate}{" "}
                {graduate === 1 ? "student in" : "students in"}{" "}
                {exitGrade ?? "the exit grade"}{" "}
                {graduate === 1 ? "is" : "are"} marked graduated
              </>
            )}
            . Charges, payments and balances are not touched.
          </DialogDescription>
        </DialogHeader>

        <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
          Safe to re-run: a student already carried into {toName} is skipped
          rather than promoted twice. Undoing a graduation, though, means
          setting each student back to active by hand.
        </p>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
          >
            {error}
          </p>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={run} disabled={pending || !toYearId}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Promote students
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
