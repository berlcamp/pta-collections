"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroller } from "@/components/common/data-table";
import { StatCard } from "@/components/common/stat-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  KNOWN_COLUMNS,
  collectSections,
  markInFileDuplicates,
  normalizeHeader,
  parseRow,
  validateHeaders,
  type ParsedRow,
} from "@/lib/import/parse";
import {
  sectionKey,
  sectionMapFrom,
  type SectionResolution,
} from "@/lib/import/sections";
import { toCsv } from "@/lib/utils/csv";
import {
  commitImport,
  resolveImportSections,
  stageImport,
  type StageResult,
} from "@/app/actions/import";

type Step = "upload" | "sections" | "review" | "done";

/** The picker value meaning "do not map this onto anything — create it". */
const CREATE_NEW = "__new__";

const TEMPLATE = `lrn,student_number,first_name,middle_name,last_name,suffix,birth_date,sex,grade_level,section,guardian1_name,guardian1_contact,guardian1_relationship
123456789012,2026-001,Juan,Dela,Cruz,,2012-05-14,M,Grade 7,Section A,Maria Dela Cruz,09171234567,Mother
123456789013,2026-002,Pedro,Santos,Reyes,,2012-08-02,M,Grade 7,Section A,Ana Reyes,09191234567,Mother`;

export function CsvImportWizard({
  schoolYearId,
  schoolYearName,
  gradeCodes,
}: {
  schoolYearId: string;
  schoolYearName: string;
  gradeCodes: string[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [dragging, setDragging] = useState(false);
  const [filename, setFilename] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [dupes, setDupes] = useState<number[]>([]);
  const [headerErrors, setHeaderErrors] = useState<string[]>([]);
  const [stage, setStage] = useState<StageResult | null>(null);
  const [resolutions, setResolutions] = useState<SectionResolution[]>([]);
  /** Per section key: the existing section to import into, or null to create it. */
  const [choices, setChoices] = useState<Record<string, string | null>>({});
  const [confirmSections, setConfirmSections] = useState(false);
  const [updateEnrollment, setUpdateEnrollment] = useState(false);
  const [summary, setSummary] = useState<{
    created: number;
    matched: number;
    guardians: number;
    skipped: number;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  function handleFile(file: File) {
    setFilename(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: normalizeHeader,
      complete: (result) => {
        const headers = result.meta.fields ?? [];
        const errs = validateHeaders(headers);
        setHeaderErrors(errs);
        if (errs.length > 0) {
          setRows([]);
          return;
        }

        const parsed = result.data.map((raw, i) => parseRow(raw, i + 2, gradeCodes));
        const dupeSet = markInFileDuplicates(parsed);
        setRows(parsed);
        setDupes([...dupeSet]);

        startTransition(async () => {
          // Sections are settled before anything is staged: a name that only
          // differs in case or spacing is mapped silently, anything merely
          // CLOSE to an existing section is put to the user.
          const res = await resolveImportSections({
            schoolYearId,
            sections: collectSections(parsed),
          });
          if (!res.ok) {
            toast.error(res.error);
            return;
          }

          const initial: Record<string, string | null> = {};
          for (const r of res.data) {
            initial[sectionKey(r.grade_level, r.csv_name)] = r.resolved;
          }
          setResolutions(res.data);
          setChoices(initial);

          if (res.data.some((r) => r.kind === "suggested" || r.kind === "new")) {
            setStep("sections");
            return;
          }
          await stageRows(parsed, [...dupeSet], res.data, initial, file.name);
        });
      },
      error: (err) => toast.error(`Could not read the file: ${err.message}`),
    });
  }

  async function stageRows(
    parsed: ParsedRow[],
    inFileDuplicates: number[],
    resolved: SectionResolution[],
    picked: Record<string, string | null>,
    name: string,
  ) {
    const res = await stageImport({
      filename: name,
      schoolYearId,
      rows: parsed,
      inFileDuplicates,
      sectionMap: sectionMapFrom(resolved, picked),
    });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setStage(res.data);
    setConfirmSections(res.data.newSections.length === 0);
    setStep("review");
  }

  function downloadErrors() {
    const bad = rows.filter((r) => r.errors.length > 0);
    const csv = toCsv(
      ["Row", "Errors", ...KNOWN_COLUMNS],
      bad.map((r) => [
        r.rowNumber,
        r.errors.join("; "),
        ...KNOWN_COLUMNS.map((c) => r.raw[c] ?? ""),
      ]),
    );
    download(csv, `import-errors-${filename}`);
  }

  function downloadTemplate() {
    download(`﻿${TEMPLATE}`, "student-import-template.csv");
  }

  function download(content: string, name: string) {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function commit() {
    if (!stage) return;
    startTransition(async () => {
      const res = await commitImport(stage.batchId, updateEnrollment);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setSummary(res.data);
      setStep("done");
      toast.success(`${res.data.created} students imported.`);
      router.refresh();
    });
  }

  // ---- Step: upload -------------------------------------------------------
  if (step === "upload") {
    return (
      <div className="max-w-3xl space-y-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f) handleFile(f);
          }}
          className={`grid place-items-center rounded-lg border-2 border-dashed px-6 py-16 text-center transition-colors ${
            dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
          }`}
        >
          {pending ? (
            <Loader2 className="mb-3 size-8 animate-spin text-muted-foreground" />
          ) : (
            <Upload className="mb-3 size-8 text-muted-foreground/60" />
          )}
          <p className="font-medium">Drop a CSV here, or choose a file</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Nothing is written until you review and confirm.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <div className="mt-4 flex gap-2">
            <Button onClick={() => fileRef.current?.click()} disabled={pending}>
              Choose file
            </Button>
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="size-4" />
              Template
            </Button>
          </div>
        </div>

        {headerErrors.length > 0 && (
          <Card className="border-destructive/40">
            <CardContent className="p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <div>
                  <p className="text-sm font-medium">This file cannot be imported</p>
                  <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                    {headerErrors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Expected columns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">Required:</strong> first_name,
              last_name, grade_level.
            </p>
            <p>
              <strong className="text-foreground">Optional:</strong> lrn,
              student_number, middle_name, suffix, birth_date, sex, section,
              guardian1_name, guardian1_contact, guardian1_relationship.
            </p>
            <p>
              A student takes <strong className="text-foreground">one</strong>{" "}
              guardian. <code>guardian2_*</code> columns from an older template
              are ignored, and every row that has one is listed before you
              import. Siblings sharing a guardian are linked to the same record,
              not given a copy each.
            </p>
            <p>
              Section names are matched against the sections defined for this
              school year. A difference in case or spacing is resolved for you;
              anything close but not equal is put to you before it is created.
            </p>
            <p>
              Grade values like <code>G7</code>, <code>Grade 7</code> and{" "}
              <code>7</code> are all understood. The school and school year come
              from the current context — a <code>school_id</code> column in the
              file is ignored.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---- Step: sections -----------------------------------------------------
  if (step === "sections") {
    const undecided = resolutions.filter(
      (r) => r.kind === "suggested" || r.kind === "new",
    );
    const autoMapped = resolutions.filter((r) => r.kind === "normalized");

    return (
      <div className="max-w-4xl space-y-4">
        <Card className="border-amber-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Match {undecided.length} section
              {undecided.length === 1 ? "" : "s"} to this school year
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              These names in the file are not sections of {schoolYearName}. Point
              each one at the section it means, or create it. Creating a
              misspelling is what puts &ldquo;Sampaguita&rdquo; and
              &ldquo;Sampagita&rdquo; side by side and splits every by-section
              report in two.
            </p>

            <TableScroller>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>In the file</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead className="text-right">Students</TableHead>
                    <TableHead>Import into</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {undecided.map((r) => {
                    const key = sectionKey(r.grade_level, r.csv_name);
                    const choice = choices[key] ?? CREATE_NEW;
                    return (
                      <TableRow key={key}>
                        <TableCell className="font-medium">
                          {r.csv_name}
                          {r.kind === "suggested" && (
                            <Badge variant="outline" className="ml-2 border-amber-500/30 text-amber-700 dark:text-amber-400">
                              Close match
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{r.grade_level}</TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {r.rows}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={choice}
                            onValueChange={(v) =>
                              setChoices((prev) => ({
                                ...prev,
                                [key]: v === CREATE_NEW ? null : v,
                              }))
                            }
                          >
                            <SelectTrigger className="w-full min-w-0 sm:w-72">
                              <SelectValue>
                                {choice === CREATE_NEW
                                  ? `Create “${r.csv_name}”`
                                  : choice}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={CREATE_NEW}>
                                Create “{r.csv_name}”
                              </SelectItem>
                              {r.candidates.map((c) => (
                                <SelectItem key={c.name} value={c.name}>
                                  {c.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableScroller>
          </CardContent>
        </Card>

        {autoMapped.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {autoMapped.length} section
                {autoMapped.length === 1 ? " was" : "s were"} matched
                automatically
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>
                Only the case, spacing or a &ldquo;Section&rdquo; prefix
                differed, so there was nothing to decide.
              </p>
              <ul className="space-y-0.5">
                {autoMapped.map((r) => (
                  <li key={sectionKey(r.grade_level, r.csv_name)}>
                    <span className="font-mono text-xs">{r.grade_level}</span>{" "}
                    “{r.csv_name}” → <strong className="text-foreground">{r.resolved}</strong>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => setStep("upload")}
            disabled={pending}
          >
            Start over
          </Button>
          <Button
            onClick={() =>
              startTransition(async () => {
                await stageRows(rows, dupes, resolutions, choices, filename);
              })
            }
            disabled={pending}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Continue
          </Button>
        </div>
      </div>
    );
  }

  // ---- Step: done ---------------------------------------------------------
  if (step === "done" && summary) {
    return (
      <div className="max-w-2xl space-y-4">
        <Card className="border-emerald-500/40">
          <CardContent className="p-6 text-center">
            <CheckCircle2 className="mx-auto mb-3 size-10 text-emerald-600" />
            <p className="text-lg font-semibold">Import complete</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {filename} → {schoolYearName}
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-4">
          <StatCard label="Students created" value={summary.created} tone="positive" />
          <StatCard label="Already existed" value={summary.matched} />
          <StatCard label="Guardians created" value={summary.guardians} />
          <StatCard label="Rows skipped" value={summary.skipped} tone={summary.skipped ? "warning" : "default"} />
        </div>

        <div className="flex gap-2">
          <Button onClick={() => router.push("/students")}>View students</Button>
          <Button
            variant="outline"
            onClick={() => {
              setStep("upload");
              setRows([]);
              setStage(null);
              setSummary(null);
              setFilename("");
              setResolutions([]);
              setChoices({});
            }}
          >
            Import another file
          </Button>
          {rows.some((r) => r.errors.length > 0) && (
            <Button variant="outline" onClick={downloadErrors}>
              <Download className="size-4" />
              Download error rows
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ---- Step: review -------------------------------------------------------
  if (!stage) return null;

  const preview = rows.slice(0, 50);
  const errorRows = rows.filter((r) => r.errors.length > 0);
  const warningRows = rows.filter((r) => r.warnings.length > 0);
  /** The section a row will actually be enrolled into, after mapping. */
  const finalSection = (grade: string, name: string) => {
    const key = sectionKey(grade, name);
    const resolution = resolutions.find(
      (r) => sectionKey(r.grade_level, r.csv_name) === key,
    );
    if (!resolution) return name;
    return (key in choices ? choices[key] : resolution.resolved) ?? name;
  };

  // Every file spelling that ends up under a different, existing section name.
  const renamed = resolutions.filter(
    (r) => finalSection(r.grade_level, r.csv_name) !== r.csv_name,
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Rows read" value={stage.total} icon={FileSpreadsheet} />
        <StatCard label="New students" value={stage.valid} tone="positive" />
        <StatCard label="Already exist" value={stage.matched} />
        <StatCard label="Duplicates in file" value={stage.duplicates} tone={stage.duplicates ? "warning" : "default"} />
        <StatCard label="Errors" value={stage.errors} tone={stage.errors ? "negative" : "default"} />
      </div>

      {stage.matched > 0 && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <div className="text-sm">
                <p className="font-medium">
                  {stage.matched} student{stage.matched === 1 ? "" : "s"} already
                  exist and will not be modified.
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  Matched on LRN, then student number — never on name. Their
                  names, LRN and financial records are left exactly as they are.
                </p>
              </div>
            </div>
            <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3">
              <Checkbox
                checked={updateEnrollment}
                onCheckedChange={(v) => setUpdateEnrollment(Boolean(v))}
                className="mt-0.5"
              />
              <span className="text-sm">
                Update grade level and section from this file
                <span className="block text-xs text-muted-foreground">
                  Only these two enrollment fields are touched. Identity and
                  financial data are never overwritten by an import.
                </span>
              </span>
            </label>
          </CardContent>
        </Card>
      )}

      {renamed.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {renamed.length} section name
              {renamed.length === 1 ? "" : "s"} matched to an existing section
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>
              These students join the section already on file. Nothing new is
              created for them.
            </p>
            <ul className="space-y-0.5">
              {renamed.map((r) => {
                const key = sectionKey(r.grade_level, r.csv_name);
                const finalName = finalSection(r.grade_level, r.csv_name);
                return (
                  <li key={key}>
                    <span className="font-mono text-xs">{r.grade_level}</span>{" "}
                    “{r.csv_name}” →{" "}
                    <strong className="text-foreground">{finalName}</strong>{" "}
                    <span className="text-xs">
                      ({r.rows} student{r.rows === 1 ? "" : "s"})
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {warningRows.length > 0 && (
        <Card className="border-amber-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {warningRows.length} row{warningRows.length === 1 ? "" : "s"} with
              a second guardian
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-sm text-muted-foreground">
              A student takes one guardian. These rows still import — only the
              first guardian is kept.
            </p>
            <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
              {warningRows.slice(0, 20).map((r) => (
                <li key={r.rowNumber} className="text-muted-foreground">
                  <span className="font-mono">Row {r.rowNumber}</span>:{" "}
                  {r.warnings.join("; ")}
                </li>
              ))}
              {warningRows.length > 20 && (
                <li className="text-muted-foreground italic">
                  …and {warningRows.length - 20} more.
                </li>
              )}
            </ul>
          </CardContent>
        </Card>
      )}

      {stage.newSections.length > 0 && (
        <Card className="border-amber-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {stage.newSections.length} new section
              {stage.newSections.length === 1 ? "" : "s"} will be created
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              These sections are not yet defined for {schoolYearName}. Check them
              for typos — confirming a misspelling here is what creates
              &ldquo;Section A&rdquo; and &ldquo;Sec A&rdquo; as two different
              sections and breaks every by-section report afterwards.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {stage.newSections.map((s) => (
                <Badge key={`${s.grade_level}-${s.name}`} variant="outline">
                  {s.grade_level} · {s.name}
                </Badge>
              ))}
            </div>
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox
                checked={confirmSections}
                onCheckedChange={(v) => setConfirmSections(Boolean(v))}
              />
              <span className="text-sm font-medium">
                These section names are correct — create them
              </span>
            </label>
          </CardContent>
        </Card>
      )}

      {errorRows.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">
              {errorRows.length} row{errorRows.length === 1 ? "" : "s"} will be
              skipped
            </CardTitle>
            <Button variant="outline" size="sm" onClick={downloadErrors}>
              <Download className="size-4" />
              Download errors
            </Button>
          </CardHeader>
          <CardContent>
            <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
              {errorRows.slice(0, 20).map((r) => (
                <li key={r.rowNumber} className="text-muted-foreground">
                  <span className="font-mono">Row {r.rowNumber}</span>:{" "}
                  {r.errors.join("; ")}
                </li>
              ))}
              {errorRows.length > 20 && (
                <li className="text-muted-foreground italic">
                  …and {errorRows.length - 20} more. Download the CSV for the full list.
                </li>
              )}
            </ul>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold">
          Preview {preview.length < rows.length && `(first ${preview.length} of ${rows.length})`}
        </h2>
        <TableScroller>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Row</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>LRN</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Guardian</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.map((r) => {
                const isDupe = dupes.includes(r.rowNumber);
                const hasError = r.errors.length > 0;
                return (
                  <TableRow key={r.rowNumber} className={hasError ? "opacity-60" : ""}>
                    <TableCell className="font-mono text-xs">{r.rowNumber}</TableCell>
                    <TableCell>
                      {hasError ? (
                        <Badge variant="outline" className="border-red-500/30 text-red-700 dark:text-red-400">
                          Error
                        </Badge>
                      ) : isDupe ? (
                        <Badge variant="outline" className="border-amber-500/30 text-amber-700 dark:text-amber-400">
                          Duplicate
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Ready</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.normalized
                        ? `${r.normalized.last_name}, ${r.normalized.first_name}`
                        : `${r.raw.last_name ?? ""}, ${r.raw.first_name ?? ""}`}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.normalized?.lrn ?? r.raw.lrn ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.normalized?.grade_level ?? r.raw.grade_level ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.normalized?.section ? (
                        <>
                          {finalSection(r.normalized.grade_level, r.normalized.section)}
                          {finalSection(
                            r.normalized.grade_level,
                            r.normalized.section,
                          ) !== r.normalized.section && (
                            <span className="block text-xs text-muted-foreground">
                              file: {r.normalized.section}
                            </span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.normalized?.guardians[0]?.name ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableScroller>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm text-muted-foreground">
            {stage.valid} student{stage.valid === 1 ? "" : "s"} will be created.
            The whole batch is applied in one transaction — if anything fails,
            nothing is written.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep("upload")} disabled={pending}>
              Start over
            </Button>
            <Button
              onClick={commit}
              disabled={pending || !confirmSections || stage.valid + stage.matched === 0}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Import {stage.valid} students
            </Button>
          </div>
        </CardContent>
      </Card>

      {!confirmSections && (
        <p className="text-sm text-amber-600">
          Confirm the new section names above before importing.
        </p>
      )}
    </div>
  );
}
