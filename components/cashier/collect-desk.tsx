"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CircleAlert,
  GraduationCap,
  Loader2,
  ScanLine,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createScanBuffer } from "@/lib/cashier/scan-buffer";
import {
  findGuardianByCard,
  loadGuardianHousehold,
  loadStudentHousehold,
  searchPayers,
  type Household,
  type PayerHit,
} from "@/lib/cashier/lookup";
import { formatMoney } from "@/lib/financial/money";
import { looksLikeCardScan, normalizeCardNumber } from "@/lib/portal/card";
import { cn } from "@/lib/utils";
import { HouseholdPayment, type CollectResult } from "./household-payment";
import { PaymentResult } from "./payment-result";

type View =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "household"; household: Household; viaCard: boolean; visit: number }
  | { kind: "done"; result: CollectResult };

const MISREAD = "That scan did not read cleanly. Please scan the card again.";
const UNKNOWN_CARD =
  "That card is not active at this school. You can search by name instead.";
const LOOKUP_FAILED =
  "Could not reach the server. Check the connection and try again.";

/**
 * The cashier's one job: a person walks up, the card is scanned, the balance is
 * on screen, money is received, the next person walks up.
 *
 * The scan field stays mounted through all of it so it never loses its place,
 * and the window listens too, because the next parent's card will arrive while
 * the cursor is somewhere else. A half-entered payment is simply replaced by the
 * next scan: nothing is recorded until the cashier confirms.
 */
export function CollectDesk({
  schoolId,
  schoolYearId,
  todayTotal,
  todayReceipts,
  recent,
}: {
  schoolId: string;
  schoolYearId: string;
  todayTotal: number;
  todayReceipts: number;
  recent: { id: string; receiptNumber: string; studentName: string; amount: number }[];
}) {
  const [view, setView] = useState<View>({ kind: "idle" });
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PayerHit[]>([]);
  const [searchedTerm, setSearchedTerm] = useState("");
  const [searchFailed, setSearchFailed] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [locked, setLocked] = useState(false);
  const [windowActive, setWindowActive] = useState(true);

  const inputRef = useRef<HTMLInputElement>(null);
  /** Only the most recent lookup may change the screen. */
  const latestLookup = useRef(0);
  const visits = useRef(0);

  const term = query.trim();
  const searching = term.length >= 2 && term !== searchedTerm;
  const visibleHits = term.length >= 2 && term === searchedTerm ? hits : [];
  const open = term.length >= 2;

  const focusField = useCallback(() => inputRef.current?.focus(), []);

  const openHousehold = useCallback(
    async (load: () => Promise<Household | null>, viaCard: boolean, missing: string) => {
      const lookup = ++latestLookup.current;
      setNotice(null);
      setQuery("");
      focusField();

      // A parent already on screen stays there until the next one has arrived,
      // so a mistaken scan does not throw away what the cashier was doing.
      setView((current) => (current.kind === "household" ? current : { kind: "loading" }));

      try {
        const household = await load();
        if (lookup !== latestLookup.current) return;
        if (!household) {
          setNotice(missing);
          setView((current) => (current.kind === "loading" ? { kind: "idle" } : current));
          return;
        }
        visits.current += 1;
        setView({ kind: "household", household, viaCard, visit: visits.current });
      } catch {
        if (lookup !== latestLookup.current) return;
        setNotice(LOOKUP_FAILED);
        setView((current) => (current.kind === "loading" ? { kind: "idle" } : current));
      }
    },
    [focusField],
  );

  const openCard = useCallback(
    (card: string) =>
      openHousehold(
        async () => {
          const guardianId = await findGuardianByCard(card);
          return guardianId
            ? loadGuardianHousehold(schoolId, schoolYearId, guardianId)
            : null;
        },
        true,
        UNKNOWN_CARD,
      ),
    [openHousehold, schoolId, schoolYearId],
  );

  function openHit(hit: PayerHit) {
    void openHousehold(
      () =>
        hit.kind === "parent"
          ? loadGuardianHousehold(schoolId, schoolYearId, hit.id)
          : loadStudentHousehold(schoolId, schoolYearId, hit.id),
      false,
      "That record could not be opened. Please search again.",
    );
  }

  function reset() {
    latestLookup.current += 1;
    setNotice(null);
    setQuery("");
    setView({ kind: "idle" });
    focusField();
  }

  // Scans that arrive while the cursor is anywhere else on the page. Capture
  // phase, so the Enter ending a scan is stopped before it can press a button.
  useEffect(() => {
    const buffer = createScanBuffer();

    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      // The field recognises its own scans from what lands in it.
      if (document.activeElement === inputRef.current) return;

      const result = buffer.feed(event.key, event.timeStamp);
      if (result.type === "scan") {
        void openCard(result.card);
      } else if (result.type === "misread") {
        event.preventDefault();
        event.stopPropagation();
        setNotice(MISREAD);
        focusField();
      } else if (result.type === "swallow") {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    // While a payment is being confirmed or recorded, the keys belong to it.
    if (locked) return;
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [locked, openCard, focusField]);

  // A scanner types into whichever window has focus. If it is not this one the
  // scan goes somewhere else entirely, so say so before it happens.
  useEffect(() => {
    const active = () => setWindowActive(true);
    const inactive = () => setWindowActive(false);
    window.addEventListener("focus", active);
    window.addEventListener("blur", inactive);
    return () => {
      window.removeEventListener("focus", active);
      window.removeEventListener("blur", inactive);
    };
  }, []);

  useEffect(() => {
    if (term.length < 2 || term === searchedTerm) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const results = await searchPayers(schoolId, schoolYearId, term);
        if (cancelled) return;
        setHits(results);
        setSearchFailed(false);
      } catch {
        if (cancelled) return;
        setHits([]);
        setSearchFailed(true);
      }
      setCursor(0);
      setSearchedTerm(term);
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, searchedTerm, schoolId, schoolYearId]);

  function onQueryChange(value: string) {
    // Recognised from the value, not from Enter: some scanners are set up
    // without a suffix and never press it.
    if (looksLikeCardScan(value)) {
      void openCard(normalizeCardNumber(value));
      return;
    }
    setQuery(value);
  }

  function onFieldKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (query) setQuery("");
      else if (!locked) reset();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (/^[0-9\s-]{16,}$/.test(term)) {
        setQuery("");
        setNotice(MISREAD);
      } else if (visibleHits[cursor]) {
        openHit(visibleHits[cursor]);
      }
      return;
    }
    if (visibleHits.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((c) => Math.min(c + 1, visibleHits.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    }
  }

  const idle = view.kind === "idle" || view.kind === "loading";

  return (
    <div className={cn(idle && "mx-auto max-w-xl pt-[8vh]")}>
      {idle && (
        <div className="mb-8 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent text-primary">
            <ScanLine className="size-7" aria-hidden />
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">
            Scan a parent card
          </h1>
          <p className="mt-1.5 text-muted-foreground">
            No card? Type the parent&rsquo;s or the student&rsquo;s name.
          </p>
        </div>
      )}

      <div className={cn("relative", !idle && "mb-6 flex items-center gap-2")}>
        <div className="relative flex-1">
          {searching || view.kind === "loading" ? (
            <Loader2
              className="absolute top-1/2 left-4 size-5 -translate-y-1/2 animate-spin text-muted-foreground motion-reduce:animate-none"
              aria-hidden
            />
          ) : (
            <Search
              className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
          )}
          <label htmlFor="cashier-scan" className="sr-only">
            Scan a parent card, or search by name
          </label>
          <Input
            ref={inputRef}
            id="cashier-scan"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            disabled={locked}
            role="combobox"
            aria-expanded={open}
            aria-controls="cashier-results"
            aria-activedescendant={
              visibleHits[cursor] ? `cashier-hit-${cursor}` : undefined
            }
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={onFieldKeyDown}
            placeholder={
              idle ? "Scan card or search name" : "Scan the next card or search name"
            }
            className={cn("bg-card pl-12 text-base", idle ? "h-14 rounded-xl" : "h-11")}
          />

          {open && (
            <div
              id="cashier-results"
              role="listbox"
              aria-label="Matching parents and students"
              className="absolute inset-x-0 top-full z-20 mt-2 max-h-[60vh] overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg"
            >
              {visibleHits.map((hit, i) => (
                <HitRow
                  key={`${hit.kind}-${hit.id}`}
                  id={`cashier-hit-${i}`}
                  hit={hit}
                  active={i === cursor}
                  onPick={() => openHit(hit)}
                />
              ))}
              {term === searchedTerm && visibleHits.length === 0 && (
                <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                  {searchFailed ? LOOKUP_FAILED : `No parent or student matches “${term}”.`}
                </p>
              )}
              {searching && (
                <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                  Searching&hellip;
                </p>
              )}
            </div>
          )}
        </div>

        {!idle && !locked && (
          <Button variant="outline" className="h-11" onClick={reset}>
            <X className="size-4" aria-hidden />
            Clear
          </Button>
        )}
      </div>

      <div aria-live="polite">
        {notice && (
          <p className="mt-3 mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm font-medium text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {notice}
          </p>
        )}
      </div>

      {idle && (
        <>
          <p
            className={cn(
              "mt-3 flex items-center justify-center gap-2 text-sm",
              windowActive ? "text-muted-foreground" : "font-medium text-destructive",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "size-2 rounded-full",
                windowActive ? "bg-success" : "bg-destructive",
              )}
            />
            {windowActive ? "Ready to scan" : "Click here before scanning"}
          </p>

          <section aria-label="Your collections today" className="mt-12">
            <div className="flex items-baseline justify-between gap-3 border-b pb-3">
              <p className="text-sm text-muted-foreground">
                Collected today &middot; {todayReceipts}{" "}
                {todayReceipts === 1 ? "receipt" : "receipts"}
              </p>
              <p className="text-lg font-semibold tabular-nums">
                {formatMoney(todayTotal)}
              </p>
            </div>
            {recent.length > 0 && (
              <ul className="divide-y">
                {recent.map((r) => (
                  <li key={r.id}>
                    <a
                      href={`/print/receipt/${r.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex min-h-11 items-center gap-3 py-2 text-sm hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <span className="min-w-0 flex-1 truncate">{r.studentName}</span>
                      <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
                        {r.receiptNumber}
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatMoney(r.amount)}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 text-right">
              <Link
                href="/cashier/report"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Open collection report
              </Link>
            </div>
          </section>
        </>
      )}

      {view.kind === "household" && (
        <HouseholdPayment
          // A new visit is a new payment: fresh selection, fresh idempotency keys.
          key={view.visit}
          household={view.household}
          viaCard={view.viaCard}
          onLockChange={setLocked}
          onCollected={(result) => {
            setView({ kind: "done", result });
            setLocked(false);
            focusField();
          }}
        />
      )}

      {view.kind === "done" && <PaymentResult result={view.result} onNext={reset} />}
    </div>
  );
}

function HitRow({
  id,
  hit,
  active,
  onPick,
}: {
  id: string;
  hit: PayerHit;
  active: boolean;
  onPick: () => void;
}) {
  const Icon = hit.kind === "parent" ? UserRound : GraduationCap;
  const detail =
    hit.kind === "parent"
      ? [hit.children.join(", "), hit.contact].filter(Boolean).join(" · ")
      : hit.detail;

  return (
    <button
      id={id}
      type="button"
      role="option"
      aria-selected={active}
      tabIndex={-1}
      // Keep focus in the field, so a scan mid-search still lands there.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPick}
      className={cn(
        "flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
        active ? "bg-accent" : "hover:bg-muted",
      )}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{hit.name}</span>
        {detail && (
          <span className="block truncate text-xs text-muted-foreground">{detail}</span>
        )}
      </span>
      <span className="text-xs text-muted-foreground">
        {hit.kind === "parent" ? "Parent" : "Student"}
      </span>
    </button>
  );
}
