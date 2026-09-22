import type { DropdownMenu } from "@sparkle/components/Dropdown";
import { LoadMore } from "@sparkle/components/LoadMore";
import { Pagination } from "@sparkle/components/Pagination";
import { cn } from "@sparkle/lib/utils";
import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  type Header as TanstackHeader,
  type Row as TanstackRow,
  type Updater,
  useReactTable,
} from "@tanstack/react-table";
import React, {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { breakpoints, useWindowSize } from "../WindowUtility";
import { Cell } from "./cells";
import {
  type DataTableDensity,
  type DataTableLayout,
  DataTableLayoutContext,
} from "./layout";
import type { MenuItem } from "./menu";
import { Body, Head, Header, Root, Row } from "./parts";
import { ALIGN_JUSTIFY_CLASS, getDataTableColumnPresets } from "./presets";

export interface TBaseData {
  onClick?: () => void;
  onDoubleClick?: () => void;
  dropdownMenuProps?: React.ComponentPropsWithoutRef<typeof DropdownMenu>;
  menuItems?: MenuItem[];
}

interface ColumnBreakpoint {
  [columnId: string]: keyof typeof breakpoints;
}

export function shouldRenderColumn(
  windowWidth: number,
  breakpoint?: keyof typeof breakpoints
): boolean {
  if (!breakpoint) {
    return true;
  }
  return windowWidth >= breakpoints[breakpoint];
}

export interface DataTableProps<TData extends TBaseData> {
  data: TData[];
  /** Total row count on the server; when larger than data.length, pagination becomes server-side. */
  totalRowCount?: number;
  /** Displays the row count as a capped value (e.g. "1000+") in the pagination. */
  rowCountIsCapped?: boolean;
  /** TanStack Table column definitions. */
  columns: ColumnDef<TData, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  className?: string;
  widthClassName?: string;
  /** Text filter value applied to filterColumn. */
  filter?: string;
  /** Id of the column the filter value applies to. */
  filterColumn?: string;
  /** Controlled pagination state; enables the pagination footer when set with setPagination. */
  pagination?: PaginationState;
  /** Called with the new pagination state when the user changes page. */
  setPagination?: (pagination: PaginationState) => void;
  /** Shows a clickable "Load more" footer, as an alternative to pagination. Ignored when pagination is set. */
  onLoadMore?: () => void;
  /** Swaps the "Load more" label for an animated "Loading" and disables it. */
  isLoadingMore?: boolean;
  /** Adds a "Show less" control next to "Load more"; pass it only once extra rows are revealed. */
  onShowLess?: () => void;
  /** Minimum breakpoint per column id below which the column is hidden. */
  columnsBreakpoints?: ColumnBreakpoint;
  /** Controlled sorting state. */
  sorting?: SortingState;
  /** Called with the new sorting state when the user toggles a column sort. */
  setSorting?: (sorting: SortingState) => void;
  /** Delegates sorting to the server instead of sorting rows client-side. */
  isServerSideSorting?: boolean;
  /** Hides the numbered page buttons, keeping only previous/next. */
  disablePaginationNumbers?: boolean;
  /** Returns a stable row id — set it when using row selection so state survives re-renders. */
  getRowId?: (
    originalRow: TData,
    index: number,
    parent?: TanstackRow<TData> | undefined
  ) => string;
  // row selection props
  /** Controlled row selection state. */
  rowSelection?: RowSelectionState;
  /** Called with the new selection state when the user selects rows. */
  setRowSelection?: (rowSelection: RowSelectionState) => void;
  /** Enables row selection, globally or per row via a predicate. */
  enableRowSelection?: boolean | ((row: TanstackRow<TData>) => boolean);
  /** Allows selecting several rows at once (default true). */
  enableMultiRowSelection?: boolean;
  /** Allows a third sort toggle back to the unsorted state (default true). */
  enableSortingRemoval?: boolean;
  /** Omit the default bottom divider on tbody rows (e.g. dense custom lists). */
  hideRowDivider?: boolean;
  disableRowClickSelection?: boolean;
  /** Row height scale: 40px compact, 48px default, 64px relaxed. Cell helpers and the skeleton follow it. */
  density?: DataTableDensity;
  /** Dims the current rows in place while new data loads, keeping header, filter and pagination usable. */
  isLoading?: boolean;
  /** Rendered as a single full-width row when there are no rows to show. */
  emptyState?: ReactNode;
  /** Human-readable label per row, used to name the selection checkbox ("Select {label}"). */
  getRowLabel?: (row: TData) => string;
  /** Keeps the header visible while the body scrolls. Needs `maxHeight` to have an effect. */
  stickyHeader?: boolean;
  /** Max-height class for the scroll container (e.g. "max-h-96"); the body scrolls vertically past it. */
  maxHeight?: string;
  /** Lets wide tables scroll horizontally instead of squeezing columns; each column gets a 124px minimum. */
  horizontalScroll?: boolean;
}

const ROW_REVEAL_DURATION_MS = 300;

/**
 * Reveals appended rows by animating the table's height, so the rows slide into
 * view at exactly the rate the footer below them moves down. Animating the
 * footer instead would let the rows pop in ahead of it.
 */
function useRowRevealAnimation(rowCount: number, enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const previousHeightRef = useRef<number | null>(null);
  const previousRowCountRef = useRef(rowCount);

  // Keep the last laid-out height current through every layout change, not just
  // row changes. Cells are skipped on the first commit (the window size is not
  // measured yet), so a height recorded only on mount would be the height of a
  // table with no columns, and the first reveal would animate from ~nothing.
  // ResizeObserver callbacks run after layout effects, so the value read below
  // is always the height from before the new rows landed.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !enabled) {
      return;
    }

    previousHeightRef.current = element.scrollHeight;

    const observer = new ResizeObserver(() => {
      previousHeightRef.current = element.scrollHeight;
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, [enabled]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    // `scrollHeight` reports the content height even while we pin `height`
    // mid-animation, so this stays correct if rows land back to back.
    const height = element.scrollHeight;
    const previousHeight = previousHeightRef.current;
    const grew = rowCount > previousRowCountRef.current;

    previousRowCountRef.current = rowCount;

    if (
      !enabled ||
      !grew ||
      previousHeight === null ||
      previousHeight >= height ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const clear = () => {
      element.style.transition = "";
      element.style.height = "";
      element.style.overflow = "";
    };

    element.style.overflow = "hidden";
    element.style.transition = "none";
    element.style.height = `${previousHeight}px`;

    const frame = requestAnimationFrame(() => {
      element.style.transition = `height ${ROW_REVEAL_DURATION_MS}ms ease-out`;
      element.style.height = `${height}px`;
    });

    element.addEventListener("transitionend", clear, { once: true });

    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener("transitionend", clear);
      clear();
    };
  }, [rowCount, enabled]);

  return ref;
}

/**
 * A tabular data display built on TanStack Table, with text filtering, client-
 * or server-side sorting, pagination or a "Load more" footer, and row
 * selection, rendered with the DataTable.* cell helpers. Use it to list
 * structured records (data sources, members, files); for very long or infinite
 * server-side datasets, prefer ScrollableDataTable, which virtualizes rows and
 * loads more on scroll.
 * @summary Sortable, filterable, paginated data table.
 */
export function DataTableBase<TData extends TBaseData>({
  data,
  totalRowCount,
  rowCountIsCapped = false,
  columns,
  className,
  widthClassName = "w-full",
  filter,
  filterColumn,
  columnsBreakpoints = {},
  pagination,
  setPagination,
  onLoadMore,
  isLoadingMore = false,
  onShowLess,
  sorting,
  setSorting,
  isServerSideSorting = false,
  disablePaginationNumbers = false,
  rowSelection,
  setRowSelection,
  enableRowSelection = false,
  enableMultiRowSelection = true,
  getRowId,
  enableSortingRemoval = true,
  hideRowDivider = false,
  disableRowClickSelection = false,
  density = "default",
  isLoading = false,
  emptyState,
  getRowLabel,
  stickyHeader = false,
  maxHeight,
  horizontalScroll = false,
}: DataTableProps<TData>) {
  const windowSize = useWindowSize();

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const isServerSidePagination = !!totalRowCount && totalRowCount > data.length;
  const isClientSideSortingEnabled =
    !isServerSideSorting && !isServerSidePagination;

  const onPaginationChange =
    pagination && setPagination
      ? (updater: Updater<PaginationState>) => {
          const newValue =
            typeof updater === "function" ? updater(pagination) : updater;
          setPagination(newValue);
        }
      : undefined;

  const onSortingChange =
    sorting && setSorting
      ? (updater: Updater<SortingState>) => {
          const newValue =
            typeof updater === "function" ? updater(sorting) : updater;
          setSorting(newValue);
        }
      : undefined;

  const onRowSelectionChange =
    rowSelection && setRowSelection
      ? (updater: Updater<RowSelectionState>) => {
          const newValue =
            typeof updater === "function" ? updater(rowSelection) : updater;
          setRowSelection(newValue);
        }
      : undefined;

  const table = useReactTable({
    data,
    columns,
    rowCount: totalRowCount,
    manualPagination: isServerSidePagination,
    manualSorting: isServerSideSorting,
    ...(isServerSideSorting && {
      onSortingChange: onSortingChange,
    }),
    enableSortingRemoval,
    getCoreRowModel: getCoreRowModel(),
    ...(!isServerSideSorting && {
      getSortedRowModel: getSortedRowModel(),
      enableSorting: isClientSideSortingEnabled,
    }),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: pagination ? getPaginationRowModel() : undefined,
    onColumnFiltersChange: setColumnFilters,
    ...(enableRowSelection && {
      onRowSelectionChange,
    }),
    state: {
      columnFilters,
      ...(isServerSideSorting && {
        sorting,
      }),
      pagination,
      ...(enableRowSelection && { rowSelection }),
    },
    initialState: {
      sorting,
    },
    onPaginationChange,
    enableRowSelection,
    enableMultiRowSelection,
    getRowId,
    ...(getRowLabel && { meta: { getRowLabel } }),
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: table is recreated every render, adding it would cause infinite re-runs
  useEffect(() => {
    if (filterColumn) {
      table.getColumn(filterColumn)?.setFilterValue(filter);
    }
  }, [filter, filterColumn]);

  const rows = table.getRowModel().rows;
  // Uses the rendered row count, not `data.length`, so filtering keeps the
  // measured height in sync.
  const rowRevealRef = useRowRevealAnimation(
    rows.length,
    !!onLoadMore && !pagination
  );

  const isColumnVisible = (columnId: string) =>
    !!windowSize.width &&
    shouldRenderColumn(windowSize.width, columnsBreakpoints[columnId]);

  const visibleColumnCount = table
    .getVisibleLeafColumns()
    .filter((column) => isColumnVisible(column.id)).length;

  const layout = useMemo<DataTableLayout>(
    () => ({ density, enforceColumnMinWidth: horizontalScroll }),
    [density, horizontalScroll]
  );

  return (
    <DataTableLayoutContext.Provider value={layout}>
      <div className={cn("flex flex-col gap-2", className, widthClassName)}>
        <Root
          containerRef={rowRevealRef}
          containerClassName={cn(
            horizontalScroll && "overflow-x-auto",
            maxHeight && "overflow-y-auto",
            maxHeight
          )}
          // Auto layout lets the table outgrow its container; fixed layout
          // would always share the width and never overflow.
          className={cn(horizontalScroll && "w-max min-w-full table-auto")}
        >
          <Header
            className={cn(
              // Borders do not stick with border-collapse, so the divider is a shadow.
              stickyHeader &&
                "sticky top-0 z-20 bg-background shadow-[inset_0_-1px_0_var(--color-separator)]"
            )}
          >
            {table.getHeaderGroups().map((headerGroup) => (
              <Row key={headerGroup.id} widthClassName={widthClassName}>
                {headerGroup.headers.map((header) => {
                  if (!isColumnVisible(header.id)) {
                    return null;
                  }
                  const canSort =
                    header.column.getCanSort() &&
                    getDataTableColumnPresets(header.column).sortable;
                  return (
                    <Head
                      column={header.column}
                      key={header.id}
                      onSort={
                        canSort
                          ? header.column.getToggleSortingHandler()
                          : undefined
                      }
                    >
                      {renderHeaderContent(header, canSort)}
                    </Head>
                  );
                })}
              </Row>
            ))}
          </Header>
          <Body
            aria-busy={isLoading || undefined}
            className={cn(
              isLoading &&
                "pointer-events-none opacity-50 transition-opacity duration-enter ease-enter motion-reduce:transition-none"
            )}
          >
            {rows.map((row) => {
              const handleRowClick = () => {
                if (enableRowSelection && row.getCanSelect()) {
                  row.toggleSelected(
                    !enableMultiRowSelection ? true : undefined
                  );
                }
                row.original.onClick?.();
              };

              return (
                <Row
                  widthClassName={widthClassName}
                  key={row.id}
                  hideBottomBorder={hideRowDivider}
                  onClick={
                    enableRowSelection && !disableRowClickSelection
                      ? handleRowClick
                      : row.original.onClick
                  }
                  onDoubleClick={row.original.onDoubleClick}
                  rowData={row.original}
                  {...(enableRowSelection && {
                    "data-selected": row.getIsSelected(),
                  })}
                >
                  {row.getVisibleCells().map((cell) => {
                    if (!isColumnVisible(cell.column.id)) {
                      return null;
                    }
                    return (
                      <Cell column={cell.column} key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </Cell>
                    );
                  })}
                </Row>
              );
            })}
            {rows.length === 0 && emptyState !== undefined && (
              <tr>
                <td
                  colSpan={Math.max(visibleColumnCount, 1)}
                  className="px-2 py-8 text-center text-sm text-muted-foreground"
                >
                  {emptyState}
                </td>
              </tr>
            )}
          </Body>
        </Root>
        {pagination && (
          <div className="p-1">
            <Pagination
              size="xs"
              pagination={table.getState().pagination}
              setPagination={table.setPagination}
              rowCount={table.getRowCount()}
              rowCountIsCapped={rowCountIsCapped}
              disablePaginationNumbers={disablePaginationNumbers}
            />
          </div>
        )}
        {!pagination && onLoadMore && (
          <div className="p-1">
            <LoadMore
              onLoadMore={onLoadMore}
              onShowLess={onShowLess}
              isLoading={isLoadingMore}
              rowCount={data.length}
              totalRowCount={totalRowCount}
              totalRowCountIsCapped={rowCountIsCapped}
            />
          </div>
        )}
      </div>
    </DataTableLayoutContext.Provider>
  );
}

// Sortable headers get their content straight into Head's sort button; other
// headers keep the historical flex wrapper so existing layouts do not move.
export function renderHeaderContent<TData>(
  header: TanstackHeader<TData, unknown>,
  canSort: boolean
) {
  const content = flexRender(
    header.column.columnDef.header,
    header.getContext()
  );
  if (canSort) {
    return content;
  }
  const { headerAlign } = getDataTableColumnPresets(header.column);
  return (
    <div
      className={cn(
        "flex items-center gap-1 whitespace-nowrap",
        headerAlign !== "left" && ALIGN_JUSTIFY_CLASS[headerAlign]
      )}
    >
      {content}
    </div>
  );
}
