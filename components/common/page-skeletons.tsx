import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Loading states for the `loading.tsx` files under app/(app).
 *
 * Next shows a segment's loading.tsx the instant a link is clicked, and — for
 * dynamic routes like every one here (D20) — prefetches it ahead of the click,
 * so the skeleton paints before the server has answered at all. Without one a
 * click simply froze on the old page until the new one had fully rendered.
 *
 * Each skeleton mirrors the real page's frame (PageHeader, then the body), so
 * the swap to real content moves nothing: same header height, same border,
 * same grid. They are deliberately generic — five shapes cover forty pages —
 * because a skeleton that drifts from its page is worse than a plain one.
 */

function Loading({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">Loading…</span>
      {children}
    </div>
  );
}

/** Same box as components/common/page-header.tsx. */
function HeaderSkeleton({ actions = 1 }: { actions?: number }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b pb-5">
      <div className="min-w-0 space-y-2.5">
        <Skeleton className="h-7 w-56 max-w-[60vw]" />
        <Skeleton className="h-4 w-80 max-w-[75vw]" />
      </div>
      {actions > 0 && (
        <div className="flex gap-2">
          {Array.from({ length: actions }, (_, i) => (
            <Skeleton key={i} className="h-9 w-28" />
          ))}
        </div>
      )}
    </div>
  );
}

function CardFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border bg-card p-5", className)}>{children}</div>
  );
}

function StatTiles({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <CardFrame key={i} className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-3 w-20" />
        </CardFrame>
      ))}
    </div>
  );
}

function TableBlock({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex gap-4 border-b bg-muted/40 px-4 py-3">
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton key={i} className={cn("h-4", i === 0 ? "w-40" : "flex-1")} />
        ))}
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex items-center gap-4 px-4 py-3.5">
            {Array.from({ length: columns }, (_, c) => (
              <Skeleton
                key={c}
                className={cn(
                  "h-4",
                  c === 0 ? "w-40" : "flex-1",
                  // Uneven widths read as data rather than as stripes.
                  c > 0 && (r + c) % 3 === 0 && "max-w-[60%]",
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Toolbar() {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Skeleton className="h-9 w-full max-w-xs" />
      <Skeleton className="h-9 w-32" />
      <Skeleton className="ml-auto h-9 w-24" />
    </div>
  );
}

/** A list page: header, search/filter toolbar, table. The default. */
export function TablePageSkeleton() {
  return (
    <Loading>
      <HeaderSkeleton />
      <Toolbar />
      <TableBlock />
    </Loading>
  );
}

/** Dashboard and overview pages: stat tiles above two panels. */
export function DashboardSkeleton() {
  return (
    <Loading className="space-y-6">
      <HeaderSkeleton actions={1} />
      <StatTiles count={8} />
      <div className="grid gap-4 lg:grid-cols-3">
        <CardFrame className="space-y-4 lg:col-span-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-64 w-full" />
        </CardFrame>
        <CardFrame className="space-y-3">
          <Skeleton className="h-5 w-32" />
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </CardFrame>
      </div>
    </Loading>
  );
}

/** Reports: a filter bar, summary figures, then the table. */
export function ReportSkeleton() {
  return (
    <Loading className="space-y-6">
      <HeaderSkeleton actions={2} />
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-28" />
      </div>
      <StatTiles count={4} />
      <TableBlock rows={6} columns={6} />
    </Loading>
  );
}

/** A single record: summary cards, then its lines. */
export function DetailPageSkeleton() {
  return (
    <Loading className="space-y-6">
      <HeaderSkeleton actions={2} />
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <CardFrame key={i} className="space-y-3">
            <Skeleton className="h-4 w-28" />
            {Array.from({ length: 4 }, (_, r) => (
              <div key={r} className="flex gap-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </CardFrame>
        ))}
      </div>
      <TableBlock rows={5} />
    </Loading>
  );
}

/** Create/edit/import screens: one card of labelled fields. */
export function FormPageSkeleton() {
  return (
    <Loading>
      <HeaderSkeleton actions={0} />
      <CardFrame className="max-w-3xl space-y-6">
        {Array.from({ length: 3 }, (_, s) => (
          <div key={s} className="space-y-4">
            <Skeleton className="h-5 w-36" />
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }, (_, f) => (
                <div key={f} className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="flex justify-end gap-2 border-t pt-5">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-32" />
        </div>
      </CardFrame>
    </Loading>
  );
}

/** The Parent Portal: a narrow column of cards, sized for a phone. */
export function CardListSkeleton() {
  return (
    <Loading className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      {Array.from({ length: 3 }, (_, i) => (
        <CardFrame key={i} className="space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardFrame>
      ))}
    </Loading>
  );
}
