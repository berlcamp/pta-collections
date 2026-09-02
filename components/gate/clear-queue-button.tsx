"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eraser, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { clearUnassignedCards } from "@/app/actions/gate";

/**
 * Empty the enrolment list.
 *
 * NO UID LIST IS SENT. The server decides the set inside the same statement
 * that writes it, so a card tapping for the first time while the operator reads
 * this page is either cleared with the rest or not at all — never left behind
 * while the toast says everything went.
 *
 * There is no confirmation, and there should not be. Clearing costs nothing:
 * the taps are all still in attendance, and any card that mattered comes back
 * by being held against the reader — which is what the operator is standing
 * there doing anyway. A dialog would be asking permission for something that
 * cannot go wrong.
 */
export function ClearQueueButton({
  schoolId,
  count,
}: {
  schoolId: string;
  count: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (count === 0) return null;

  return (
    <button
      type="button"
      title="Clear the list"
      aria-label="Clear the enrolment list"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await clearUnassignedCards({ schoolId });
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(
            result.data === 0
              ? "The list was already empty."
              : `List cleared — ${result.data.toLocaleString()} card${
                  result.data === 1 ? "" : "s"
                } removed.`,
            { description: "Tap a card on the reader and it will show up again." },
          );
          router.refresh();
        })
      }
      className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Eraser className="size-4" />
      )}
    </button>
  );
}
