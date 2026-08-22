"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { dynamicRoute } from "@/lib/routes";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

/**
 * Pagination for lists the SERVER pages, so a school with 4,000 students never
 * ships 4,000 rows to a tablet. Preserves whatever filters are already on the
 * URL — losing the search term on page 2 is the classic bug here.
 */
export function ServerPagination({
  page,
  pages,
  total,
  pageSize,
  noun,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  noun: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  function hrefFor(p: number) {
    const next = new URLSearchParams(params.toString());
    if (p <= 1) next.delete("page");
    else next.set("page", String(p));
    const qs = next.toString();
    return dynamicRoute(qs ? `${pathname}?${qs}` : pathname);
  }

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  // A window of at most five page numbers keeps the control usable at 80 pages.
  const window: number[] = [];
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  for (let p = start; p <= Math.min(pages, start + 4); p++) window.push(p);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        Showing <span className="font-medium text-foreground">{from}</span>–
        <span className="font-medium text-foreground">{to}</span> of{" "}
        <span className="font-medium text-foreground">{total.toLocaleString()}</span>{" "}
        {noun}
        {total === 1 ? "" : "s"}
      </p>

      {pages > 1 && (
        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              {page > 1 ? (
                <PaginationLink asChild size="default" className="pl-1.5!">
                  <Link href={hrefFor(page - 1)} aria-label="Go to previous page">
                    <ChevronLeft data-icon="inline-start" />
                    <span className="hidden sm:block">Previous</span>
                  </Link>
                </PaginationLink>
              ) : (
                <PaginationPrevious
                  aria-disabled
                  className="pointer-events-none opacity-50"
                />
              )}
            </PaginationItem>

            {window.map((p) => (
              <PaginationItem key={p} className="hidden sm:block">
                <PaginationLink asChild isActive={p === page}>
                  <Link href={hrefFor(p)}>{p}</Link>
                </PaginationLink>
              </PaginationItem>
            ))}

            <PaginationItem>
              {page < pages ? (
                <PaginationLink asChild size="default" className="pr-1.5!">
                  <Link href={hrefFor(page + 1)} aria-label="Go to next page">
                    <span className="hidden sm:block">Next</span>
                    <ChevronRight data-icon="inline-end" />
                  </Link>
                </PaginationLink>
              ) : (
                <PaginationNext
                  aria-disabled
                  className="pointer-events-none opacity-50"
                />
              )}
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
