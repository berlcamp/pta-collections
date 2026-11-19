import { DoorOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { portalCard } from "@/components/portal/styles";

export function NoSections({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className={cn(portalCard, "mx-auto mt-10 flex max-w-md flex-col items-center gap-3 p-10 text-center")}>
      <span className="grid size-14 place-items-center rounded-2xl bg-blue-50 text-blue-700">
        <DoorOpen className="size-7" />
      </span>
      <p className="text-lg font-semibold text-slate-900">No section assigned yet</p>
      <p className="text-sm text-slate-500">
        {isAdmin
          ? "This school year has no sections. Add them under Administration → Sections."
          : "Ask the school office to assign you to your section. It will appear here as soon as they do."}
      </p>
    </div>
  );
}
