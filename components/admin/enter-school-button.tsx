"use client";

import { useTransition } from "react";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { switchSchool } from "@/app/actions/school-context";

export function EnterSchoolButton({ schoolId }: { schoolId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => startTransition(() => void switchSchool(schoolId))}
    >
      <LogIn className="size-4" />
      Enter school
    </Button>
  );
}
