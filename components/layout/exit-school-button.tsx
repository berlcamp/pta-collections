"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exitSchool } from "@/app/actions/school-context";

export function ExitSchoolButton() {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => startTransition(() => void exitSchool())}
    >
      <LogOut className="size-3.5" />
      Exit School
    </Button>
  );
}
