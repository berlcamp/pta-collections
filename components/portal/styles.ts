/**
 * The portal's few repeated surfaces, as class strings.
 *
 * Strings rather than components so a <button>, an <a> and a <label> can all
 * wear the same look without a polymorphic wrapper. The portal is drawn like a
 * banking app: big rounded white cards on a pale sheet, 56px fields and
 * buttons, one blue for anything you can press.
 */

/** A white card on the sheet. */
export const portalCard =
  "rounded-3xl bg-white ring-1 ring-slate-900/5 shadow-[0_1px_2px_rgb(15_23_42/0.04),0_12px_32px_-16px_rgb(15_58_158/0.22)]";

/** The one primary button: full width, 56px, the portal's blue. */
export const portalButton =
  "portal-cta inline-flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl px-5 text-base font-semibold text-white shadow-lg shadow-blue-900/20 transition-[transform,opacity] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300";

/** A quiet secondary action under a primary one. */
export const portalGhostButton =
  "inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl px-4 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 active:bg-slate-200 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200";

/** A large text field. */
export const portalInput =
  "h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-900 outline-none transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 aria-[invalid=true]:border-red-500 aria-[invalid=true]:ring-red-500/15";

/** The label above a field. */
export const portalLabel = "mb-2 block text-sm font-medium text-slate-700";

/** A round, 44px icon button on the blue hero. */
export const heroIconButton =
  "grid size-11 shrink-0 cursor-pointer place-items-center rounded-full bg-white/12 text-white ring-1 ring-white/20 transition-colors hover:bg-white/20 active:bg-white/25 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white";

/** A small pill on the blue hero — the Pay page's secondary links. */
export const heroPill =
  "inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-white/12 px-4 text-sm font-medium text-white ring-1 ring-white/20 transition-colors hover:bg-white/20 active:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white";
