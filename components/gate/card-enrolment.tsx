"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, IdCard, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { assignCard, clearUnassignedCards } from "@/app/actions/gate";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/utils/dates";

/**
 * The enrolment queue: cards that have been tapped but belong to nobody.
 *
 * The order is deliberate. Newest tap first, because the workflow is "hold the
 * card on the reader, then come to this screen" — the card in the operator's
 * hand should be the row at the top, not something they have to hunt for.
 *
 * There is no "create a student" path here, and there must not be one. A
 * student invented at the gate would have no enrolment row, hence no school
 * year, no section and no student number: invisible in this app and unbillable.
 * Students are created under Students; this screen binds plastic to one.
 *
 * There is also no longer a box to TYPE a uid into. A card uid is 4–32
 * characters of hex read off a Wiegand decoder, and nobody can copy one by eye
 * without transposing a pair of digits sooner or later. The failure is silent
 * in the worst way: assign_student_card() happily binds a uid that no card in
 * the building actually carries, the screen says the card was issued, and the
 * student then taps every morning and never appears — while the real uid sits
 * in the queue looking like a stranger's card. The reader is the only thing
 * that can be trusted to say what a card's uid is, so the only way in is to
 * tap it. The one exception is the deep link from the live monitor, and that
 * uid came off a genuine tap too.
 */

export interface QueueCard {
  card_uid: string;
  scan_count: number;
  first_seen_at: string;
  last_seen_at: string;
  last_device_id: string | null;
}

export interface RosterOption {
  student_id: string;
  full_name: string;
  student_no: string | null;
  grade_level: string | null;
  section_name: string | null;
  card_count: number;
}

export function CardEnrolment({
  queue,
  roster,
  schoolId,
  timezone,
  /** Card UID deep-linked from the live monitor's "Assign" action. */
  preselected,
}: {
  queue: QueueCard[];
  roster: RosterOption[];
  schoolId: string;
  timezone: string;
  preselected?: string;
}) {
  const [target, setTarget] = useState<string | null>(preselected ?? null);

  // A deep link from the monitor should open the dialog on arrival, and again
  // if the operator clicks a different unknown card over there. Adjusted during
  // render rather than in an effect: an effect would paint the closed dialog
  // first and then re-render it open.
  const [lastLink, setLastLink] = useState(preselected);
  if (preselected !== lastLink) {
    setLastLink(preselected);
    setTarget(preselected ?? null);
  }

  return (
    <>
      {queue.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="Nothing waiting to be enrolled"
          description="Every card tapped at this gate belongs to a student. Tap an unassigned card on the reader and it will appear here."
        />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {queue.map((c) => (
            <li key={c.card_uid} className="group/card relative">
              <button
                type="button"
                onClick={() => setTarget(c.card_uid)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border bg-card p-3 pr-10 text-left transition-colors",
                  "hover:border-primary/40 hover:bg-muted/50",
                )}
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-warning/15 text-warning">
                  <CreditCard className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-mono font-medium">
                    {c.card_uid}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Last tapped {formatDateTime(c.last_seen_at, timezone)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {c.scan_count} tap{c.scan_count === 1 ? "" : "s"}
                    {c.last_device_id ? ` · ${c.last_device_id}` : ""}
                  </span>
                </span>
              </button>

              {/* Nested inside the <li>, never inside the button above it: a
                  button in a button is invalid HTML and the browser lifts it
                  out, which puts the control where nobody expects it. */}
              <RemoveCardButton schoolId={schoolId} cardUid={c.card_uid} />
            </li>
          ))}
        </ul>
      )}

      <AssignDialog
        cardUid={target}
        roster={roster}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
      />
    </>
  );
}

/**
 * Take one card off the list.
 *
 * Deliberately quiet — an icon that appears on hover and focus — because the
 * main verb on this screen is enrolment, and an operator hunting for the card
 * in their hand should not have a row of crosses competing for the click.
 *
 * It is not a delete and not a judgement: the taps stay in attendance and the
 * card returns the next time the reader sees it. See the header of
 * 0023_gate_queue_clear.sql.
 */
function RemoveCardButton({
  schoolId,
  cardUid,
}: {
  schoolId: string;
  cardUid: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      title={`Remove ${cardUid} from the list`}
      aria-label={`Remove ${cardUid} from the enrolment list`}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await clearUnassignedCards({
            schoolId,
            cardUids: [cardUid],
          });
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(`${cardUid} removed from the list.`, {
            description: "Tap it on the reader again and it will come back.",
          });
          router.refresh();
        })
      }
      className={cn(
        "absolute top-2 right-2 grid size-7 place-items-center rounded-md text-muted-foreground transition",
        "opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100",
        "hover:bg-destructive/10 hover:text-destructive",
        "disabled:pointer-events-none disabled:opacity-50",
      )}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <X className="size-4" />
      )}
    </button>
  );
}

function AssignDialog({
  cardUid,
  roster,
  onOpenChange,
}: {
  cardUid: string | null;
  roster: RosterOption[];
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);

  // Same render-time reset: a new card means a fresh search and no selection,
  // and carrying the previous student over would be one click from assigning
  // the wrong card to them.
  const [lastCard, setLastCard] = useState(cardUid);
  if (cardUid !== lastCard) {
    setLastCard(cardUid);
    setQuery("");
    setPicked(null);
  }

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    // Students who already hold a card sort last rather than being hidden: a
    // reissued card after a lost one is an ordinary Tuesday, and hiding them
    // would send the operator hunting for a bug that isn't there.
    const scored = roster.filter(
      (r) =>
        term.length === 0 ||
        r.full_name.toLowerCase().includes(term) ||
        (r.student_no ?? "").toLowerCase().includes(term) ||
        (r.section_name ?? "").toLowerCase().includes(term),
    );
    return scored
      .sort((a, b) => a.card_count - b.card_count || a.full_name.localeCompare(b.full_name))
      .slice(0, 50);
  }, [roster, query]);

  function submit() {
    if (!cardUid || !picked) return;
    startTransition(async () => {
      const result = await assignCard({ studentId: picked, cardUid });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const student = roster.find((r) => r.student_id === picked);
      toast.success(`${cardUid} now belongs to ${student?.full_name ?? "the student"}.`);
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={cardUid !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign card {cardUid}</DialogTitle>
          <DialogDescription>
            Pick the student who will carry this card. If someone else holds it
            today, their card is retired first — past attendance keeps naming
            whoever actually held it at the time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, student number or section…"
              className="pl-9"
            />
          </div>

          <ul className="max-h-72 space-y-1 overflow-y-auto rounded-lg border p-1">
            {matches.length === 0 && (
              <li className="p-4 text-center text-sm text-muted-foreground">
                No student on the active year&apos;s roster matches that.
              </li>
            )}
            {matches.map((r) => (
              <li key={r.student_id}>
                <button
                  type="button"
                  onClick={() => setPicked(r.student_id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                    picked === r.student_id
                      ? "bg-primary/10 ring-1 ring-primary/40"
                      : "hover:bg-muted",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {r.full_name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {[r.student_no, r.grade_level, r.section_name]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </span>
                  </span>
                  {r.card_count > 0 && (
                    <Badge variant="outline" className="shrink-0">
                      <IdCard className="size-3.5" />
                      {r.card_count}
                    </Badge>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!picked || pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Assign card
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
