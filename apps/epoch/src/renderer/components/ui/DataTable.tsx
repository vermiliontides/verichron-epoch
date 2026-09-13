import React, { useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type Row,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';

/**
 * Generic virtualized data table for the investigation views (RunsView,
 * RecordsView today; anything columnar later).
 *
 * Why this is a CSS grid, not a virtualized <table>
 * --------------------------------------------------
 * Row virtualization needs to absolutely-position each row at a computed
 * offset. Native table layout computes column widths and row placement
 * assuming every row is present in normal flow -- fighting virtualization
 * the moment row heights differ (which they do here: RecordsView's
 * click-to-expand JSON detail changes a row's height). TanStack's own
 * virtualized-table reference pattern solves this with role="table" /
 * role="row" / role="cell" on a CSS grid instead of a real <table> --
 * screen readers get the same semantics via ARIA roles, and column
 * alignment comes from `grid-template-columns` instead of the table
 * layout algorithm, which is what actually breaks under virtualization.
 *
 * Column widths
 * -------------
 * Each column declares its own grid track via `meta.width` (e.g. '8rem',
 * 'minmax(12rem, 1fr)'). Defaults to `minmax(7.5rem, 1fr)` so a column
 * that doesn't care just grows evenly -- callers only need to set
 * `meta.width` on columns that need a fixed or capped width (e.g. a
 * status badge column that shouldn't stretch).
 *
 * Dynamic row height (expand/collapse)
 * -------------------------------------
 * `measureElement` measures the ACTUAL rendered row -- including its
 * expanded detail block when `expandedId` matches -- rather than trusting
 * `estimateRowHeight`. react-virtual re-measures via ResizeObserver
 * whenever the measured element's content changes, so toggling
 * `expandedId` and re-rendering is enough; no manual re-measure call is
 * needed.
 */

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    /** CSS grid track for this column, e.g. '8rem' or 'minmax(10rem, 1fr)'. */
    width?: string;
  }
}

const DEFAULT_COLUMN_TRACK = 'minmax(7.5rem, 1fr)';

const headerCellClass =
  'flex items-center px-4 py-3 text-label text-muted-foreground bg-surface/90 border-b border-border/60';

export interface DataTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData, any>[];
  /** Stable row id -- required for measurement/expansion to survive
   * re-sorts or filters without remeasuring the wrong row. Defaults to
   * react-table's own index-based id if omitted. */
  getRowId?: (row: TData, index: number) => string;
  /** Detail content shown below a row when its id matches `expandedId`.
   * Returning null/undefined means this row has nothing to expand. */
  renderExpanded?: (row: TData) => React.ReactNode;
  /** Controlled: at most one row expanded at a time, matching the
   * existing click-to-expand pattern already used by RecordsView/IocsView. */
  expandedId?: string | null;
  onRowClick?: (row: TData) => void;
  /** Initial height guess in px before measurement settles. Only affects
   * first-paint scroll math -- never affects final layout. */
  estimateRowHeight?: number;
  emptyState?: React.ReactNode;
  /** Height of the scroll viewport. A virtualizer needs a bounded
   * scrollport to compute which rows are visible; callers embed this in
   * a flex/grid layout that already constrains height (see RunsView). */
  className?: string;
}

 export interface DataTableProps<TData> {
   data: TData[];
   columns: ColumnDef<TData, any>[];
   getRowId?: (row: TData, index: number) => string;
   renderExpanded?: (row: TData) => React.ReactNode;
   expandedId?: string | null;
  /** Highlights a row with the accent-bar selected treatment, independent
  * of expansion -- RunsView selects a run without expanding any detail;
  * RecordsView expands a row's JSON without it being "selected" in any
  * lasting sense. Kept as two props rather than overloading expandedId,
  * since a future view could plausibly want both at once. */
    selectedId?: string | null;
   onRowClick?: (row: TData) => void;
   estimateRowHeight?: number;
   emptyState?: React.ReactNode;
   className?: string;
 }

 export function DataTable<TData>({
   data,
   columns,
   getRowId,
   renderExpanded,
   expandedId,
+  selectedId,
   onRowClick,
   estimateRowHeight = 44,
   emptyState,
   className,
 }: DataTableProps<TData>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: getRowId as ((row: TData, index: number) => string) | undefined,
  });

  const rows = table.getRowModel().rows;
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateRowHeight,
    overscan: 8,
    getItemKey: (index) => rows[index]?.id ?? index,
  });

  const gridTemplateColumns = table
    .getFlatHeaders()
    .map((header) => header.column.columnDef.meta?.width ?? DEFAULT_COLUMN_TRACK)
    .join(' ');

  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div ref={parentRef} role="table" className={`relative overflow-auto ${className ?? ''}`}>
      {/* Header: sticky, not part of the virtualized/scrolling body -- this
       * mirrors the existing sticky-header pattern in RunsView/RecordsView,
       * which keeps working unchanged since sticky positioning is relative
       * to the scrollport, not the virtual item list. */}
      <div role="rowgroup" className="sticky top-0 z-10">
        {table.getHeaderGroups().map((headerGroup) => (
          <div key={headerGroup.id} role="row" className="grid" style={{ gridTemplateColumns }}>
            {headerGroup.headers.map((header) => (
              <div key={header.id} role="columnheader" className={headerCellClass}>
                {header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext())}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Body: sized to the virtualizer's total (including measured
       * expanded rows), rows absolutely positioned at their computed
       * offset within it. */}
      <div role="rowgroup" style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index] as Row<TData>;
          const isExpanded = expandedId != null && row.id === expandedId;
          const expandedContent = isExpanded ? renderExpanded?.(row.original) : null;

          return (
            <div
              key={row.id}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              role="row"
              onClick={() => onRowClick?.(row.original)}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className={`transition-colors ${onRowClick ? 'cursor-pointer' : ''} ${
                isExpanded ? 'bg-surface shadow-elevation-1' : 'hover:bg-surface/60'
              }`}
            >
              <div className="grid" style={{ gridTemplateColumns }}>
                {row.getVisibleCells().map((cell) => (
                  <div
                    role="cell"
                    key={cell.id}
                    className="flex items-center px-4 py-3 text-data border-b border-border/40"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
              </div>
              {expandedContent && (
                <div className="px-4 py-4 border-b border-border/40 bg-surface">
                  {expandedContent}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}