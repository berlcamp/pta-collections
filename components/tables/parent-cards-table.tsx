"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  CreditCard,
  Eye,
  KeyRound,
  Loader2,
  Lock,
  MoreHorizontal,
  ShieldAlert,
} from "lucide-react";

import { DataTable, SortableHeader } from "@/components/common/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDateTime } from "@/lib/utils/dates";
import type {
  ParentCardDetail,
  ParentCardPending,
} from "@/types/database.types";

/**
 * The two parent-card lists, as data tables.
 *
 * They read like the gate's Roster on /super/attendance on purpose: a school
 * with six hundred families cannot be served by a scrolling stack of cards, and
 * the question staff actually arrive with — "has THIS parent got a card, and is
 * it still good?" — is a search box and a status filter, not a list to skim.
 *
 * Neither table can show a card number: v_parent_cards_detail returns it
 * already masked, and the PIN exists only as a salted hash. The one moment
 * either is legible is the reveal dialog in parent-card-manager.tsx.
 */

/**
 * Which row is mid-flight, and doing what. The issued list spins its one menu
 * trigger and needs only the id; the pending list carries a button per row and
 * needs the verb to tell an issue in flight from anything else.
 */
export type CardBusy = {
  id: string;
  verb: "issue" | "reveal" | "reset" | "revoke";
} | null;

/** True while the account is inside a failed-attempt lockout. */
export function isLocked(card: ParentCardDetail): boolean {
  return Boolean(card.locked_until && new Date(card.locked_until) > new Date());
}

function children(n: number) {
  return `${n} ${n === 1 ? "child" : "children"}`;
}

export function IssuedCardsTable({
  rows,
  timezone,
  pinRequired,
  busy,
  canReveal,
  onReveal,
  onResetPin,
  onRevoke,
}: {
  rows: ParentCardDetail[];
  timezone: string;
  /** 0017. With the PIN off there is no secret to reset, so the verb is hidden. */
  pinRequired: boolean;
  /** Which row is mid-flight, so only its own button spins. */
  busy: CardBusy;
  /** 0020. Super admin only — everyone else sees the mask and nothing else. */
  canReveal: boolean;
  onReveal: (card: ParentCardDetail) => void;
  onResetPin: (card: ParentCardDetail) => void;
  onRevoke: (card: ParentCardDetail) => void;
}) {
  const columns: ColumnDef<ParentCardDetail>[] = [
    {
      accessorKey: "guardian_name",
      meta: { label: "Guardian" },
      header: ({ column }) => <SortableHeader column={column} title="Guardian" />,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.guardian_name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[children(row.original.children), row.original.contact_number]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "card_masked",
      meta: { label: "Card" },
      header: "Card",
      cell: ({ row }) => (
        <span className="font-mono text-sm whitespace-nowrap">
          {row.original.card_masked}
        </span>
      ),
    },
    {
      id: "status",
      accessorFn: (r) =>
        r.status === "revoked" ? "Revoked" : isLocked(r) ? "Locked" : "Active",
      meta: { label: "Status" },
      header: "Status",
      cell: ({ row }) => {
        const card = row.original;
        if (card.status === "revoked") {
          return (
            <div className="min-w-0">
              <Badge variant="destructive">Revoked</Badge>
              {card.revoked_at && (
                <p className="mt-0.5 text-xs whitespace-nowrap text-muted-foreground">
                  {formatDateTime(card.revoked_at, timezone)}
                </p>
              )}
            </div>
          );
        }
        if (isLocked(card)) {
          return (
            <Badge variant="outline" className="gap-1 text-warning">
              <Lock className="size-3" />
              Locked
            </Badge>
          );
        }
        return <Badge variant="secondary">Active</Badge>;
      },
      filterFn: "equalsString",
    },
    {
      id: "telegram",
      accessorFn: (r) => (r.telegram_linked ? "Linked" : "Not linked"),
      meta: { label: "Telegram" },
      header: "Telegram",
      cell: ({ row }) =>
        row.original.telegram_linked ? (
          <Badge variant="secondary">Linked</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
      filterFn: "equalsString",
    },
    {
      id: "actions",
      header: "",
      enableHiding: false,
      cell: ({ row }) => {
        const card = row.original;
        // Nothing can be done to a revoked card — reveal_parent_card() refuses
        // one and it cannot be un-revoked — so it gets no menu rather than a
        // menu of disabled verbs. It stays on the list, not filtered away,
        // because "this parent used to hold one" is a question staff ask.
        if (card.status !== "active") {
          return <span className="block text-right text-muted-foreground">—</span>;
        }

        const working = busy?.id === card.id;

        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  disabled={busy !== null}
                  aria-label={`Actions for ${card.guardian_name}`}
                >
                  {working ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <MoreHorizontal className="size-4" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {canReveal && (
                  <DropdownMenuItem onSelect={() => onReveal(card)}>
                    <Eye />
                    Show number
                  </DropdownMenuItem>
                )}
                {pinRequired && (
                  <DropdownMenuItem onSelect={() => onResetPin(card)}>
                    <KeyRound />
                    Reset PIN
                  </DropdownMenuItem>
                )}
                {(canReveal || pinRequired) && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => onRevoke(card)}
                >
                  <ShieldAlert />
                  Revoke card
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      pageSize={25}
      searchPlaceholder="Search guardian or card…"
      facets={[
        {
          columnId: "status",
          title: "Statuses",
          options: [
            { value: "Active", label: "Active" },
            { value: "Locked", label: "Locked" },
            { value: "Revoked", label: "Revoked" },
          ],
        },
        {
          columnId: "telegram",
          title: "Telegram",
          options: [
            { value: "Linked", label: "Linked" },
            { value: "Not linked", label: "Not linked" },
          ],
        },
      ]}
      initialSorting={[{ id: "guardian_name", desc: false }]}
    />
  );
}

export function PendingCardsTable({
  rows,
  busy,
  onIssue,
}: {
  rows: ParentCardPending[];
  /** Which row is mid-flight, so only its own button spins. */
  busy: CardBusy;
  onIssue: (guardian: ParentCardPending) => void;
}) {
  const columns: ColumnDef<ParentCardPending>[] = [
    {
      accessorKey: "guardian_name",
      meta: { label: "Guardian" },
      header: ({ column }) => <SortableHeader column={column} title="Guardian" />,
      cell: ({ row }) => (
        <p className="truncate font-medium">{row.original.guardian_name}</p>
      ),
    },
    {
      accessorKey: "children",
      meta: { label: "Children" },
      header: ({ column }) => <SortableHeader column={column} title="Children" />,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {children(row.original.children)}
        </span>
      ),
    },
    {
      id: "contact_number",
      accessorFn: (r) => r.contact_number ?? "",
      meta: { label: "Contact" },
      header: "Contact",
      cell: ({ row }) => (
        <span className="text-sm whitespace-nowrap text-muted-foreground">
          {row.original.contact_number ?? "—"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      enableHiding: false,
      cell: ({ row }) => (
        <div className="text-right">
          <Button
            size="sm"
            disabled={busy !== null}
            onClick={() => onIssue(row.original)}
          >
            {busy?.id === row.original.guardian_id && busy.verb === "issue" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CreditCard className="size-4" />
            )}
            Issue card
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      pageSize={10}
      searchPlaceholder="Search guardian…"
      initialSorting={[{ id: "children", desc: true }]}
    />
  );
}
