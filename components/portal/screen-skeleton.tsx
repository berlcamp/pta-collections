import { PortalScreen } from "@/components/portal/screen";

/**
 * The loading frame for every signed-in portal screen.
 *
 * It draws the real hero and sheet, so the blue is already on screen the
 * instant a button is tapped and the content fades in underneath rather than
 * the whole page flashing white first.
 */
export function PortalScreenSkeleton({ hero = "tall" }: { hero?: "tall" | "short" }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <PortalScreen
        hero={
          <div className="animate-pulse">
            <div className="flex h-14 items-center gap-3">
              <div className="size-11 rounded-full bg-white/15" />
              <div className="h-4 w-40 rounded-full bg-white/15" />
            </div>
            {hero === "tall" && (
              <div className="mt-4 h-32 rounded-3xl bg-white/10" />
            )}
          </div>
        }
      >
        <div className="animate-pulse space-y-3">
          <div className="h-24 rounded-3xl bg-white" />
          <div className="h-24 rounded-3xl bg-white" />
          <div className="h-40 rounded-3xl bg-white" />
        </div>
      </PortalScreen>
    </div>
  );
}
