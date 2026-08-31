"use client";

import { useEffect, useState } from "react";
import { CreditCard, Loader2, Search, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/browser";
import { looksLikeCardScan, normalizeCardNumber } from "@/lib/portal/card";
import { formatMoney } from "@/lib/financial/money";
import { formatNameListing } from "@/lib/utils/names";
import { PaymentComposer } from "./payment-composer";

interface SearchHit {
  student_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  grade_level: string;
  section_name: string | null;
  student_number: string | null;
  outstanding: number;
}

/**
 * The cashier's entry point: one big search box, keyboard-driven, then the
 * allocation composer. Searching runs server-side against indexed columns —
 * the browser never holds the student body (v1 §17).
 */
export function NewPaymentFlow({
  schoolId,
  schoolYearId,
  initialStudentId,
}: {
  schoolId: string;
  schoolYearId: string;
  initialStudentId: string | null;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initialStudentId);
  const [cursor, setCursor] = useState(0);

  const term = query.trim();
  // Derived, not stored: below the threshold there is simply nothing to show.
  // Clearing via setState inside the effect would trigger a cascading render.
  const visibleHits = term.length < 2 ? [] : hits;

  // A parent card scanned into this box, resolved to that guardian's children.
  //
  // A barcode scanner IS a keyboard: it types the 16 digits and presses Enter,
  // so there is no hardware integration and no second screen — the box simply
  // learns to recognise what was typed. The Luhn check digit is what tells a
  // card from a 16-digit LRN, and it is verified in the browser so a misread
  // scan never becomes a server round trip.
  const [scannedGuardian, setScannedGuardian] = useState<string | null>(null);

  useEffect(() => {
    if (term.length < 2) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      const supabase = createClient();

      if (looksLikeCardScan(term)) {
        // lookup_parent_card returns people, never the credential — and refuses
        // outright for a card belonging to another school.
        const { data } = await supabase.rpc("lookup_parent_card", {
          p_card_number: normalizeCardNumber(term),
        });
        const rows = (data ?? []) as {
          guardian_name: string;
          student_id: string;
          student_name: string;
          student_no: string | null;
          grade_level: string | null;
          section_name: string | null;
          outstanding: number;
        }[];

        if (!cancelled) {
          setScannedGuardian(rows[0]?.guardian_name ?? null);
          setHits(
            rows.map((row) => {
              // student_name arrives already rendered by pta.display_name();
              // split it back into the shape this list expects rather than
              // teaching the row component a second name format.
              const [last, rest] = row.student_name.split(",");
              return {
                student_id: row.student_id,
                first_name: (rest ?? "").trim(),
                middle_name: null,
                last_name: (last ?? row.student_name).trim(),
                suffix: null,
                grade_level: row.grade_level ?? "",
                section_name: row.section_name,
                student_number: row.student_no,
                outstanding: Number(row.outstanding ?? 0),
              };
            }),
          );
          setCursor(0);
          setLoading(false);
        }
        return;
      }

      setScannedGuardian(null);
      const escaped = term.replace(/[%,()]/g, " ");
      const { data } = await supabase
        .from("v_student_payment_status")
        .select(
          "student_id,first_name,middle_name,last_name,suffix,grade_level,section_name,student_number,outstanding",
        )
        .eq("school_id", schoolId)
        .eq("school_year_id", schoolYearId)
        .or(
          [
            `first_name.ilike.%${escaped}%`,
            `last_name.ilike.%${escaped}%`,
            `student_number.ilike.%${escaped}%`,
          ].join(","),
        )
        .order("last_name")
        .limit(20);

      if (!cancelled) {
        setHits((data ?? []) as SearchHit[]);
        setCursor(0);
        setLoading(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, schoolId, schoolYearId]);

  if (selectedId) {
    return (
      <PaymentComposer
        schoolYearId={schoolYearId}
        studentId={selectedId}
        onBack={() => {
          setSelectedId(null);
          setQuery("");
        }}
      />
    );
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (visibleHits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, visibleHits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      setSelectedId(visibleHits[cursor].student_id);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="relative">
        {loading ? (
          <Loader2 className="absolute top-1/2 left-4 size-5 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : (
          <Search className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
        )}
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Scan a parent card, or search name, student number or LRN..."
          className="h-14 pl-12 text-base"
        />
      </div>

      {scannedGuardian && (
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
          <CreditCard className="size-4 text-muted-foreground" />
          Parent card &mdash; <span className="font-medium">{scannedGuardian}</span>
        </p>
      )}

      {term.length >= 2 && visibleHits.length === 0 && !loading && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {looksLikeCardScan(term)
            ? "That parent card is not registered at this school."
            : `No students match \u201C${query}\u201D.`}
        </p>
      )}

      <div className="mt-4 space-y-2">
        {visibleHits.map((hit, i) => (
          <Card
            key={hit.student_id}
            role="button"
            tabIndex={0}
            onClick={() => setSelectedId(hit.student_id)}
            onKeyDown={(e) => e.key === "Enter" && setSelectedId(hit.student_id)}
            className={
              i === cursor
                ? "cursor-pointer border-primary ring-1 ring-primary"
                : "cursor-pointer hover:border-primary/50"
            }
          >
            <CardContent className="flex items-center gap-3 p-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-full bg-muted">
                <UserRound className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{formatNameListing(hit)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {hit.grade_level}
                  {hit.section_name ? ` · ${hit.section_name}` : ""}
                  {hit.student_number ? ` · ${hit.student_number}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-sm font-semibold tabular-nums">
                  {formatMoney(hit.outstanding)}
                </p>
                <Badge
                  variant={Number(hit.outstanding) > 0 ? "outline" : "secondary"}
                  className="mt-0.5 text-[10px]"
                >
                  {Number(hit.outstanding) > 0 ? "Outstanding" : "Settled"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {term.length < 2 && (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Type at least two characters. Use ↑ ↓ to move and Enter to open.
        </p>
      )}
    </div>
  );
}
