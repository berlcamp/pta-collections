import { ShieldAlert } from "lucide-react";
import { ExitSchoolButton } from "./exit-school-button";

/**
 * Shown whenever a Super Admin is operating inside a school they hold no
 * membership in. The switcher is a scoping filter, not a security boundary
 * (D2) — this banner plus the audit stamp is what makes it accountable.
 */
export function SuperAdminBanner({ schoolName }: { schoolName: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-warning/40 bg-warning/10 px-4 py-2.5 text-sm md:px-6">
      <ShieldAlert className="size-4 shrink-0 text-warning" />
      <span className="text-xs font-semibold tracking-wide text-warning uppercase">
        Super Admin
      </span>
      <span className="text-muted-foreground">
        Acting as School Administrator &middot;{" "}
        <span className="font-medium text-foreground">{schoolName}</span>
      </span>
      <span className="ml-auto">
        <ExitSchoolButton />
      </span>
    </div>
  );
}
