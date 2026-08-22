"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Power } from "lucide-react";
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
import { setSchoolActive } from "@/app/actions/admin";

export function SchoolActiveToggle({
  schoolId,
  active,
}: {
  schoolId: string;
  active: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const res = await setSchoolActive(schoolId, !active);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(active ? "School deactivated." : "School reactivated.");
      router.refresh();
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant={active ? "outline" : "default"} disabled={pending}>
          <Power className="size-4" />
          {active ? "Deactivate" : "Reactivate"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {active ? "Deactivate this school?" : "Reactivate this school?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {active
              ? "Every user of this school loses access on their very next request, including its own administrators. No data is deleted, and reactivating restores access immediately."
              : "Users of this school regain access immediately."}
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
            {active ? "Deactivate" : "Reactivate"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
