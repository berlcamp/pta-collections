"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { DataTable, SortableHeader } from "@/components/common/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { revokeCard } from "@/app/actions/gate";
import { formatDateTime } from "@/lib/utils/dates";

/**
 * Cards currently in circulation.
 *
 * Revoking is the only destructive-looking verb here and it destroys nothing:
 * it stamps revoked_at, so every past scan still resolves to the person who
 * genuinely held the card that day. That is worth saying in the confirmation,
 * because "revoke" reads like "erase" to most people.
 */
export interface StudentCardRow {
  id: string;
  card_uid: string;
  student_name: string;
  student_no: string | null;
  grade_level: string | null;
  section_name: string | null;
  issued_at: string;
  last_used_at: string | null;
  /** False once the holder has left the active year's roster. */
  on_roster: boolean;
}

export function StudentCardsTable({
  rows,
  timezone,
}: {
  rows: StudentCardRow[];
  timezone: string;
}) {
  const [revoking, setRevoking] = useState<StudentCardRow | null>(null);

  const columns: ColumnDef<StudentCardRow>[] = [
    {
      accessorKey: "student_name",
      meta: { label: "Student" },
      header: ({ column }) => <SortableHeader column={column} title="Student" />,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.student_name}</p>
          <p className="text-xs text-muted-foreground">
            {[row.original.student_no, row.original.grade_level, row.original.section_name]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "card_uid",
      meta: { label: "Card" },
      header: ({ column }) => <SortableHeader column={column} title="Card" />,
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.original.card_uid}</span>
      ),
    },
    {
      id: "status",
      accessorFn: (r) => (r.on_roster ? "Enrolled" : "Off roster"),
      meta: { label: "Holder" },
      header: "Holder",
      cell: ({ row }) =>
        row.original.on_roster ? (
          <span className="text-xs text-muted-foreground">On roster</span>
        ) : (
          // Graduated or transferred out. The card still opens the same gate,
          // which is precisely why it is listed rather than filtered away.
          <Badge variant="outline" className="text-warning">
            Off roster
          </Badge>
        ),
      filterFn: "equalsString",
    },
    {
      accessorKey: "issued_at",
      meta: { label: "Issued" },
      header: ({ column }) => <SortableHeader column={column} title="Issued" />,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDateTime(row.original.issued_at, timezone)}
        </span>
      ),
    },
    {
      accessorKey: "last_used_at",
      meta: { label: "Last tap" },
      header: ({ column }) => <SortableHeader column={column} title="Last tap" />,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.last_used_at
            ? formatDateTime(row.original.last_used_at, timezone)
            : "never"}
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
            variant="ghost"
            size="sm"
            onClick={() => setRevoking(row.original)}
          >
            <Undo2 className="size-4" />
            Revoke
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        pageSize={25}
        searchPlaceholder="Search student or card…"
        facets={[
          {
            columnId: "status",
            title: "Holders",
            options: [
              { value: "Enrolled", label: "On roster" },
              { value: "Off roster", label: "Off roster" },
            ],
          },
        ]}
        initialSorting={[{ id: "issued_at", desc: true }]}
      />
      <RevokeDialog card={revoking} onClose={() => setRevoking(null)} />
    </>
  );
}

function RevokeDialog({
  card,
  onClose,
}: {
  card: StudentCardRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog open={card !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Retire card {card?.card_uid}?</AlertDialogTitle>
          <AlertDialogDescription>
            {card?.student_name} stops being recognised by this card from now
            on. Nothing is deleted — every scan already recorded still names
            them, because attendance resolves against who held the card at the
            time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              if (!card) return;
              startTransition(async () => {
                const result = await revokeCard(card.id);
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                toast.success(`Card ${card.card_uid} retired.`);
                onClose();
                router.refresh();
              });
            }}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Retire card
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
