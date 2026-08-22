"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { setMembershipStatus } from "@/app/actions/admin";

export function MembershipToggle({
  schoolUserId,
  status,
  name,
}: {
  schoolUserId: string;
  status: "active" | "inactive";
  name: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const next = status === "active" ? "inactive" : "active";

  function toggle() {
    startTransition(async () => {
      const res = await setMembershipStatus({ schoolUserId, status: next });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(next === "active" ? "Access restored." : "Access revoked.");
      router.refresh();
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={pending}>
          {status === "active" ? "Deactivate" : "Reactivate"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {status === "active" ? `Revoke access for ${name}?` : `Restore access for ${name}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {status === "active"
              ? "They lose access on their very next request — their session stays signed in but every page returns nothing. Payments they already recorded are untouched."
              : "They regain access immediately with their previous role."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              toggle();
            }}
          >
            {status === "active" ? "Revoke access" : "Restore access"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
