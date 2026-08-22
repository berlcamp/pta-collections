"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type Table as TanstackTable,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Wrapper that keeps wide tables scrollable inside their own container.
 * The page body must never scroll horizontally — cashiers work on tablets.
 */
export function TableScroller({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-full overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sortable header                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Header cell that toggles sorting. Rendered as a real button so the column is
 * reachable by keyboard — a plain `onClick` on a `<th>` is not.
 */
export function SortableHeader<TData, TValue>({
  column,
  title,
  className,
  align = "left",
}: {
  column: import("@tanstack/react-table").Column<TData, TValue>;
  title: string;
  className?: string;
  align?: "left" | "right" | "center";
}) {
  // Non-sortable headers are plain text and inherit the <th>'s casing, so the
  // sortable ones must match it exactly — otherwise one column in a row of
  // small-caps labels shows up in sentence case and reads as a different kind
  // of thing.
  if (!column.getCanSort()) {
    return <span className={className}>{title}</span>;
  }

  const sorted = column.getIsSorted();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => column.toggleSorting(sorted === "asc")}
      className={cn(
        "-mx-2.5 h-7 text-xs font-semibold tracking-wide text-muted-foreground uppercase hover:text-foreground",
        align === "right" && "ml-auto flex",
        align === "center" && "mx-auto flex",
        className,
      )}
    >
      <span>{title}</span>
      {sorted === "asc" ? (
        <ArrowUp className="size-3.5 text-foreground" />
      ) : sorted === "desc" ? (
        <ArrowDown className="size-3.5 text-foreground" />
      ) : (
        <ChevronsUpDown className="size-3.5 opacity-40" />
      )}
    </Button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Faceted filter                                                            */
/* -------------------------------------------------------------------------- */

export interface FacetFilter {
  /** Column id the filter drives. */
  columnId: string;
  title: string;
  options: { label: string; value: string }[];
}

function FacetSelect<TData>({
  table,
  facet,
}: {
  table: TanstackTable<TData>;
  facet: FacetFilter;
}) {
  const column = table.getColumn(facet.columnId);
  if (!column) return null;

  const value = (column.getFilterValue() as string) ?? "__all__";

  return (
    <Select
      value={value}
      onValueChange={(v) =>
        column.setFilterValue(v === "__all__" ? undefined : v)
      }
    >
      <SelectTrigger size="sm" className="h-9 min-w-[10rem]">
        <SelectValue placeholder={facet.title} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">All {facet.title.toLowerCase()}</SelectItem>
        {facet.options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/* -------------------------------------------------------------------------- */
/*  DataTable                                                                 */
/* -------------------------------------------------------------------------- */

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  /** Placeholder for the built-in search box. Omit to hide the box. */
  searchPlaceholder?: string;
  /** Dropdown filters bound to specific columns. */
  facets?: FacetFilter[];
  /** Rows per page. `0` disables pagination — use for short, complete lists. */
  pageSize?: number;
  /** Extra controls rendered on the right of the toolbar. */
  toolbar?: React.ReactNode;
  /**
   * Caller-supplied filters rendered at the START of the toolbar, in place of
   * the built-in search box. Server-paged tables use this so their URL-driven
   * filters sit on the same row as the View menu instead of floating above it.
   */
  leading?: React.ReactNode;
  /** Shown in place of the table body when there are no rows at all. */
  emptyState?: React.ReactNode;
  /** Default sort applied on mount. */
  initialSorting?: SortingState;
  /** Columns hidden by default; still listed in the View menu. */
  initialColumnVisibility?: VisibilityState;
  /** Hide the "View" column-visibility menu. */
  hideViewOptions?: boolean;
  /**
   * Totals row, rendered in a `<tfoot>`. Only meaningful on an unpaginated
   * table — a total under page 2 of 7 would be a lie, so it is dropped when
   * pagination is on.
   */
  footer?: React.ReactNode;
  className?: string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchPlaceholder,
  facets,
  pageSize = 25,
  toolbar,
  leading,
  emptyState,
  initialSorting = [],
  initialColumnVisibility = {},
  hideViewOptions = false,
  footer,
  className,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(
    initialColumnVisibility,
  );
  const [globalFilter, setGlobalFilter] = React.useState("");

  const paginated = pageSize > 0;

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, columnVisibility, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: "includesString",
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    ...(paginated ? { getPaginationRowModel: getPaginationRowModel() } : {}),
    initialState: paginated ? { pagination: { pageSize } } : undefined,
  });

  const rows = table.getRowModel().rows;
  const filtered = table.getFilteredRowModel().rows.length;
  const isFiltered =
    columnFilters.length > 0 || globalFilter.trim().length > 0;

  // No rows before any filtering — that is an empty dataset, not an empty
  // search, and it deserves the caller's richer empty state.
  if (data.length === 0 && emptyState) return <>{emptyState}</>;

  const showToolbar = Boolean(
    searchPlaceholder || facets?.length || toolbar || leading || !hideViewOptions,
  );

  return (
    <div className={cn("space-y-3", className)}>
      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          {leading}

          {searchPlaceholder && (
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-9 pl-9"
                aria-label={searchPlaceholder}
              />
            </div>
          )}

          {facets?.map((f) => (
            <FacetSelect key={f.columnId} table={table} facet={f} />
          ))}

          {isFiltered && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={() => {
                setGlobalFilter("");
                setColumnFilters([]);
              }}
            >
              <X className="size-3.5" />
              Reset
            </Button>
          )}

          <div className="ml-auto flex items-center gap-2">
            {toolbar}
            {!hideViewOptions && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9">
                    <SlidersHorizontal className="size-3.5" />
                    <span className="hidden sm:inline">View</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {table
                    .getAllColumns()
                    .filter((c) => c.getCanHide())
                    .map((c) => (
                      <DropdownMenuCheckboxItem
                        key={c.id}
                        checked={c.getIsVisible()}
                        onCheckedChange={(v) => c.toggleVisibility(!!v)}
                        onSelect={(e) => e.preventDefault()}
                        className="capitalize"
                      >
                        {typeof c.columnDef.meta === "object" &&
                        c.columnDef.meta &&
                        "label" in c.columnDef.meta
                          ? String(
                              (c.columnDef.meta as { label?: string }).label,
                            )
                          : c.id.replace(/_/g, " ")}
                      </DropdownMenuCheckboxItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      )}

      <TableScroller>
        <Table>
          <TableHeader className="bg-muted/60">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={
                      header.column.columnDef.size
                        ? { width: header.column.columnDef.size }
                        : undefined
                    }
                    className="h-11 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="px-3 py-2.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="h-28 text-center text-muted-foreground"
                >
                  No rows match the current filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          {footer && !paginated && rows.length > 0 && (
            <TableFooter>{footer}</TableFooter>
          )}
        </Table>
      </TableScroller>

      {paginated && filtered > 0 && (
        <DataTablePagination table={table} total={filtered} />
      )}
      {!paginated && isFiltered && (
        <p className="text-xs text-muted-foreground">
          {filtered} of {data.length} shown
        </p>
      )}
    </div>
  );
}

function DataTablePagination<TData>({
  table,
  total,
}: {
  table: TanstackTable<TData>;
  total: number;
}) {
  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = table.getPageCount();
  const from = total === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min(total, (pageIndex + 1) * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        Showing <span className="font-medium text-foreground">{from}</span>–
        <span className="font-medium text-foreground">{to}</span> of{" "}
        <span className="font-medium text-foreground">{total}</span>
      </p>

      <div className="flex items-center gap-4">
        <div className="hidden items-center gap-2 sm:flex">
          <span className="text-sm text-muted-foreground">Rows</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => table.setPageSize(Number(v))}
          >
            <SelectTrigger size="sm" className="h-8 w-[4.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 25, 50, 100].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            aria-label="First page"
          >
            <ChevronsLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="px-2 text-sm whitespace-nowrap tabular-nums">
            {pageIndex + 1} / {Math.max(1, pageCount)}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => table.setPageIndex(pageCount - 1)}
            disabled={!table.getCanNextPage()}
            aria-label="Last page"
          >
            <ChevronsRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Badge that shows how many rows a server-side query returned. */
export function RowCountBadge({ count, noun }: { count: number; noun: string }) {
  return (
    <Badge variant="secondary" className="tabular-nums">
      {count.toLocaleString()} {noun}
      {count === 1 ? "" : "s"}
    </Badge>
  );
}
