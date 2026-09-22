import type { DropdownMenu } from "@sparkle/components/Dropdown";
import { LoadMore } from "@sparkle/components/LoadMore";
import { Pagination } from "@sparkle/components/Pagination";
import { cn } from "@sparkle/lib/utils";
import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  functionalUpdate,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  type Header as TanstackHeader,
  type HeaderGroup as TanstackHeaderGroup,
  type Row as TanstackRow,
  type Table as TanstackTable,
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

// Animates the table height (not the footer) so appended rows slide in at the
// rate the footer moves down; animating the footer lets rows pop in ahead of it.
function useRowRevealAnimation(rowCount: number, enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const previousHeightRef = useRef<number | null>(null);
  const previousRowCountRef = useRef(rowCount);

  // Cells are skipped on the first commit (window size not measured yet), so a
  // mount-only height would be ~0. ResizeObserver runs after layout effects, so
  // the stored value is always the height from before the new rows landed.
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

    // scrollHeight stays the content height while `height` is pinned mid-animation.
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

// Adapts a controlled `(value) => void` setter to TanStack's Updater API; only when both the value and its setter are provided.
function useControlledUpdater<T>(
  value: T | undefined,
  setValue: ((value: T) => void) | undefined
): ((updater: Updater<T>) => void) | undefined {
  return value && setValue
    ? (updater: Updater<T>) => {
        setValue(functionalUpdate(updater, value));
      }
    : undefined;
}

interface DataTableInstanceOptions<TData extends TBaseData> {
  data: TData[];
  columns: ColumnDef<TData, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  totalRowCount?: number;
  filter?: string;
  filterColumn?: string;
  pagination?: PaginationState;
  setPagination?: (pagination: PaginationState) => void;
  sorting?: SortingState;
  setSorting?: (sorting: SortingState) => void;
  isServerSideSorting: boolean;
  rowSelection?: RowSelectionState;
  setRowSelection?: (rowSelection: RowSelectionState) => void;
  enableRowSelection: boolean | ((row: TanstackRow<TData>) => boolean);
  enableMultiRowSelection: boolean;
  getRowId?: DataTableProps<TData>["getRowId"];
  enableSortingRemoval: boolean;
  getRowLabel?: (row: TData) => string;
}

// Builds the TanStack table for DataTableBase, wiring controlled state and the text filter.
function useDataTableInstance<TData extends TBaseData>({
  data,
  columns,
  totalRowCount,
  filter,
  filterColumn,
  pagination,
  setPagination,
  sorting,
  setSorting,
  isServerSideSorting,
  rowSelection,
  setRowSelection,
  enableRowSelection,
  enableMultiRowSelection,
  getRowId,
  enableSortingRemoval,
  getRowLabel,
}: DataTableInstanceOptions<TData>) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const isServerSidePagination = !!totalRowCount && totalRowCount > data.length;
  const isClientSideSortingEnabled =
    !isServerSideSorting && !isServerSidePagination;

  const onPaginationChange = useControlledUpdater(pagination, setPagination);
  const onSortingChange = useControlledUpdater(sorting, setSorting);
  const onRowSelectionChange = useControlledUpdater(
    rowSelection,
    setRowSelection
  );

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

  return table;
}

interface DataTableHeaderRowProps<TData extends TBaseData> {
  headerGroup: TanstackHeaderGroup<TData>;
  widthClassName: string;
  isColumnVisible: (columnId: string) => boolean;
}

function DataTableHeaderRow<TData extends TBaseData>({
  headerGroup,
  widthClassName,
  isColumnVisible,
}: DataTableHeaderRowProps<TData>) {
  return (
    <Row widthClassName={widthClassName}>
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
              canSort ? header.column.getToggleSortingHandler() : undefined
            }
          >
            {renderHeaderContent(header, canSort)}
          </Head>
        );
      })}
    </Row>
  );
}

interface DataTableBodyRowProps<TData extends TBaseData> {
  row: TanstackRow<TData>;
  widthClassName: string;
  hideRowDivider: boolean;
  enableRowSelection: boolean | ((row: TanstackRow<TData>) => boolean);
  enableMultiRowSelection: boolean;
  disableRowClickSelection: boolean;
  isColumnVisible: (columnId: string) => boolean;
}

function DataTableBodyRow<TData extends TBaseData>({
  row,
  widthClassName,
  hideRowDivider,
  enableRowSelection,
  enableMultiRowSelection,
  disableRowClickSelection,
  isColumnVisible,
}: DataTableBodyRowProps<TData>) {
  const handleRowClick = () => {
    if (enableRowSelection && row.getCanSelect()) {
      row.toggleSelected(!enableMultiRowSelection ? true : undefined);
    }
    row.original.onClick?.();
  };

  return (
    <Row
      widthClassName={widthClassName}
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
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </Cell>
        );
      })}
    </Row>
  );
}

interface DataTableFooterProps<TData extends TBaseData> {
  table: TanstackTable<TData>;
  pagination?: PaginationState;
  rowCount: number;
  totalRowCount?: number;
  rowCountIsCapped: boolean;
  disablePaginationNumbers: boolean;
  onLoadMore?: () => void;
  isLoadingMore: boolean;
  onShowLess?: () => void;
}

// Pagination when controlled pagination is set, otherwise the "Load more" control, otherwise nothing.
function DataTableFooter<TData extends TBaseData>({
  table,
  pagination,
  rowCount,
  totalRowCount,
  rowCountIsCapped,
  disablePaginationNumbers,
  onLoadMore,
  isLoadingMore,
  onShowLess,
}: DataTableFooterProps<TData>) {
  if (pagination) {
    return (
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
    );
  }
  if (onLoadMore) {
    return (
      <div className="p-1">
        <LoadMore
          onLoadMore={onLoadMore}
          onShowLess={onShowLess}
          isLoading={isLoadingMore}
          rowCount={rowCount}
          totalRowCount={totalRowCount}
          totalRowCountIsCapped={rowCountIsCapped}
        />
      </div>
    );
  }
  return null;
}

/**
 * Sortable, filterable, paginated data table built on TanStack Table, with row
 * selection and a "Load more" footer. For very long or infinite datasets prefer
 * ScrollableDataTable, which virtualizes rows.
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

  const table = useDataTableInstance({
    data,
    columns,
    totalRowCount,
    filter,
    filterColumn,
    pagination,
    setPagination,
    sorting,
    setSorting,
    isServerSideSorting,
    rowSelection,
    setRowSelection,
    enableRowSelection,
    enableMultiRowSelection,
    getRowId,
    enableSortingRemoval,
    getRowLabel,
  });

  const rows = table.getRowModel().rows;
  // Rendered row count, not data.length, so filtering keeps the height in sync.
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
          // table-auto lets the table outgrow its container; fixed layout never overflows.
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
              <DataTableHeaderRow
                key={headerGroup.id}
                headerGroup={headerGroup}
                widthClassName={widthClassName}
                isColumnVisible={isColumnVisible}
              />
            ))}
          </Header>
          <Body
            aria-busy={isLoading || undefined}
            className={cn(
              isLoading &&
                "pointer-events-none opacity-50 transition-opacity duration-enter ease-enter motion-reduce:transition-none"
            )}
          >
            {rows.map((row) => (
              <DataTableBodyRow
                key={row.id}
                row={row}
                widthClassName={widthClassName}
                hideRowDivider={hideRowDivider}
                enableRowSelection={enableRowSelection}
                enableMultiRowSelection={enableMultiRowSelection}
                disableRowClickSelection={disableRowClickSelection}
                isColumnVisible={isColumnVisible}
              />
            ))}
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
        <DataTableFooter
          table={table}
          pagination={pagination}
          rowCount={data.length}
          totalRowCount={totalRowCount}
          rowCountIsCapped={rowCountIsCapped}
          disablePaginationNumbers={disablePaginationNumbers}
          onLoadMore={onLoadMore}
          isLoadingMore={isLoadingMore}
          onShowLess={onShowLess}
        />
      </div>
    </DataTableLayoutContext.Provider>
  );
}

/** Sortable headers render straight into Head's sort button; others keep the flex wrapper so existing layouts do not move. */
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
        // Clip on the wrapper rather than in a span so headers that size
        // themselves (e.g. a centered select-all checkbox) still fill the cell.
        "flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap",
        headerAlign !== "left" && ALIGN_JUSTIFY_CLASS[headerAlign]
      )}
    >
      {content}
    </div>
  );
}
