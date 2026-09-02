import { Avatar } from "@sparkle/components/Avatar";
import { Button } from "@sparkle/components/Button";
import { Checkbox } from "@sparkle/components/Checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  type DropdownMenuItemProps,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@sparkle/components/Dropdown";
import { Icon } from "@sparkle/components/Icon";
import { IconButton } from "@sparkle/components/IconButton";
import { Pagination } from "@sparkle/components/Pagination";
import {
  radioIndicatorStyles,
  radioStyles,
} from "@sparkle/components/RadioGroup";
import { ScrollArea, ScrollBar } from "@sparkle/components/ScrollArea";
import { Spinner } from "@sparkle/components/Spinner";
import { Tooltip } from "@sparkle/components/Tooltip";
import { useCopyToClipboard } from "@sparkle/hooks";
import {
  ArrowDown,
  ArrowUp,
  ChevronSelectorVertical,
  Clipboard,
  ClipboardCheck,
  DotsHorizontal,
} from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import {
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type Row,
  type RowSelectionState,
  type SortingState,
  type Updater,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import React, { type ReactNode, useEffect, useRef, useState } from "react";
import { breakpoints, useWindowSize } from "./WindowUtility";

const cellHeight = "h-12";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    className?: string;
    tooltip?: string;
    sizeRatio?: number;
    headerAlign?: "left" | "right" | "center";
  }
}

interface TBaseData {
  onClick?: () => void;
  onDoubleClick?: () => void;
  dropdownMenuProps?: React.ComponentPropsWithoutRef<typeof DropdownMenu>;
  menuItems?: MenuItem[];
}

interface ColumnBreakpoint {
  [columnId: string]: keyof typeof breakpoints;
}

function shouldRenderColumn(
  windowWidth: number,
  breakpoint?: keyof typeof breakpoints
): boolean {
  if (!breakpoint) {
    return true;
  }
  return windowWidth >= breakpoints[breakpoint];
}

interface DataTableProps<TData extends TBaseData> {
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
    parent?: Row<TData> | undefined
  ) => string;
  // row selection props
  /** Controlled row selection state. */
  rowSelection?: RowSelectionState;
  /** Called with the new selection state when the user selects rows. */
  setRowSelection?: (rowSelection: RowSelectionState) => void;
  /** Enables row selection, globally or per row via a predicate. */
  enableRowSelection?: boolean | ((row: Row<TData>) => boolean);
  /** Allows selecting several rows at once (default true). */
  enableMultiRowSelection?: boolean;
  /** Allows a third sort toggle back to the unsorted state (default true). */
  enableSortingRemoval?: boolean;
  /** Omit the default bottom divider on tbody rows (e.g. dense custom lists). */
  hideRowDivider?: boolean;
  disableRowClickSelection?: boolean;
}

/**
 * A tabular data display built on TanStack Table, with text filtering, client-
 * or server-side sorting, pagination, and row selection, rendered with the
 * DataTable.* cell helpers. Use it to list structured records (data sources,
 * members, files); for very long or infinite server-side datasets, prefer
 * ScrollableDataTable, which virtualizes rows and supports onLoadMore.
 * @summary Sortable, filterable, paginated data table.
 */
export function DataTable<TData extends TBaseData>({
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
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: table is recreated every render, adding it would cause infinite re-runs
  useEffect(() => {
    if (filterColumn) {
      table.getColumn(filterColumn)?.setFilterValue(filter);
    }
  }, [filter, filterColumn]);

  return (
    <div className={cn("flex flex-col gap-2", className, widthClassName)}>
      <DataTable.Root>
        <DataTable.Header>
          {table.getHeaderGroups().map((headerGroup) => (
            <DataTable.Row key={headerGroup.id} widthClassName={widthClassName}>
              {headerGroup.headers.map((header) => {
                const breakpoint = columnsBreakpoints[header.id];
                if (
                  !windowSize.width ||
                  !shouldRenderColumn(windowSize.width, breakpoint)
                ) {
                  return null;
                }
                return (
                  <DataTable.Head
                    column={header.column}
                    key={header.id}
                    onClick={
                      header.column.getCanSort()
                        ? header.column.getToggleSortingHandler()
                        : undefined
                    }
                    className={cn(
                      header.column.getCanSort() && "cursor-pointer"
                    )}
                  >
                    <div
                      className={cn(
                        "flex items-center space-x-1 whitespace-nowrap",
                        header.column.columnDef.meta?.headerAlign === "right"
                          ? "justify-end"
                          : header.column.columnDef.meta?.headerAlign ===
                              "center"
                            ? "justify-center"
                            : undefined
                      )}
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                      {header.column.getCanSort() && (
                        <Icon
                          visual={
                            header.column.getIsSorted() === "asc"
                              ? ArrowUp
                              : header.column.getIsSorted() === "desc"
                                ? ArrowDown
                                : ChevronSelectorVertical
                          }
                          size="xs"
                          className="ml-1"
                        />
                      )}
                    </div>
                  </DataTable.Head>
                );
              })}
            </DataTable.Row>
          ))}
        </DataTable.Header>
        <DataTable.Body>
          {table.getRowModel().rows.map((row) => {
            const handleRowClick = () => {
              if (enableRowSelection && row.getCanSelect()) {
                row.toggleSelected(!enableMultiRowSelection ? true : undefined);
              }
              row.original.onClick?.();
            };

            return (
              <DataTable.Row
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
                  const breakpoint = columnsBreakpoints[cell.column.id];
                  if (
                    !windowSize.width ||
                    !shouldRenderColumn(windowSize.width, breakpoint)
                  ) {
                    return null;
                  }
                  return (
                    <DataTable.Cell column={cell.column} key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </DataTable.Cell>
                  );
                })}
              </DataTable.Row>
            );
          })}
        </DataTable.Body>
      </DataTable.Root>
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
    </div>
  );
}

export interface ScrollableDataTableProps<TData extends TBaseData>
  extends DataTableProps<TData> {
  /** Height of the scroll container: a max-height class name, true to fill the parent (flex-1), or unset for the default max-h-100. */
  maxHeight?: string | boolean;
  /** Called when the user scrolls near the bottom — use it for infinite loading. */
  onLoadMore?: () => void;
  /** Shows a "Loading more data..." footer and pauses onLoadMore triggers. */
  isLoading?: boolean;
  /** Ref to the scrollable container element. */
  containerRef?: React.Ref<HTMLDivElement>;
}

// cellHeight in pixels
const COLUMN_HEIGHT = 48;
const MIN_COLUMN_WIDTH = 40;

/**
 * A virtualized variant of DataTable for large or infinite datasets: rows are
 * windowed with TanStack Virtual inside a scrollable container, with a sticky
 * header and infinite loading via onLoadMore. Use it when row counts are too
 * large for pagination; for ordinary lists prefer DataTable.
 * @summary Virtualized, infinitely scrollable data table.
 */
export function ScrollableDataTable<TData extends TBaseData>({
  data,
  totalRowCount,
  columns,
  className,
  widthClassName = "w-full",
  columnsBreakpoints = {},
  maxHeight,
  onLoadMore,
  sorting,
  setSorting,
  isLoading = false,
  rowSelection,
  setRowSelection,
  enableRowSelection,
  enableMultiRowSelection = true,
  getRowId,
  containerRef,
  hideRowDivider = false,
  disableRowClickSelection = false,
}: ScrollableDataTableProps<TData>) {
  const windowSize = useWindowSize();
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const scrollSentinelRef = useRef<HTMLDivElement>(null);
  const [tableWidth, setTableWidth] = useState(0);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);

  const isSorting = !!setSorting;

  // Handle container ref
  const setRef = (element: HTMLDivElement | null) => {
    tableContainerRef.current = element;
    if (containerRef) {
      if (typeof containerRef === "function") {
        containerRef(element);
      } else if ("current" in containerRef) {
        (
          containerRef as React.MutableRefObject<HTMLDivElement | null>
        ).current = element;
      }
    }
  };

  // Monitor table width changes
  useEffect(() => {
    if (!tableContainerRef.current) {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setTableWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(tableContainerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

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
    getCoreRowModel: getCoreRowModel(),
    enableColumnResizing: true,
    ...(enableRowSelection && {
      onRowSelectionChange,
    }),
    state: {
      ...(enableRowSelection && { rowSelection }),
      ...(isSorting && {
        sorting,
      }),
    },
    manualSorting: isSorting,
    ...(isSorting && {
      onSortingChange: onSortingChange,
    }),
    enableSortingRemoval: true,
    enableRowSelection,
    enableMultiRowSelection,
    getRowId,
  });

  useEffect(() => {
    if (!tableContainerRef.current || !table || !tableWidth) {
      return;
    }
    const columns = table.getAllColumns();

    // Calculate ideal widths and handle minimums
    const idealSizing = columns.reduce(
      (acc, column) => {
        const ratio = column.columnDef.meta?.sizeRatio || 0;
        const calculated = Math.max(
          Math.floor((ratio / 100) * tableWidth),
          MIN_COLUMN_WIDTH
        );
        return { ...acc, [column.id]: calculated };
      },
      {} as Record<string, number>
    );

    // Ensure total width matches tableWidth
    const totalIdealWidth = Object.values(idealSizing).reduce(
      (a, b) => a + b,
      0
    );
    const widthDifference = tableWidth - totalIdealWidth;

    // adjust the largest column with leftover size
    if (widthDifference !== 0) {
      const adjustColumnId = Object.entries(idealSizing).sort(
        (a, b) => b[1] - a[1]
      )[0][0];

      idealSizing[adjustColumnId] += widthDifference;
    }
    table.setColumnSizing(idealSizing);
  }, [table, tableWidth]);

  // Get the current column sizing from the table for rendering
  const columnSizing = table.getState().columnSizing;

  const { rows } = table.getRowModel();
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => COLUMN_HEIGHT,
  });

  // Intersection observer for infinite loading
  useEffect(() => {
    if (!onLoadMore || !loadMoreRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        // retrieving the sentinel div
        if (entries[0].isIntersecting && !isLoading) {
          onLoadMore();
        }
      },
      {
        root: tableContainerRef.current,
        rootMargin: "200% 0% 0% 0%",
        threshold: 0.1,
      }
    );

    observer.observe(loadMoreRef.current);

    return () => {
      if (loadMoreRef.current) {
        observer.unobserve(loadMoreRef.current);
      }
      observer.disconnect();
    };
  }, [onLoadMore, isLoading]);

  // Observe whether the bottom of the table is visible to show/hide scroll indicator
  useEffect(() => {
    const sentinel = scrollSentinelRef.current;
    const root = tableContainerRef.current;
    if (!sentinel || !root) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setCanScrollDown(!entry.isIntersecting),
      { root, threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={cn(
        "relative overflow-y-auto overflow-x-hidden",
        className,
        widthClassName,
        maxHeight === true
          ? "flex-1"
          : typeof maxHeight === "string"
            ? maxHeight
            : "max-h-100"
      )}
      ref={setRef}
    >
      <div className="relative">
        <DataTable.Root className="w-full table-fixed">
          <DataTable.Header className="sticky top-0 z-20 bg-background shadow-sm">
            {table.getHeaderGroups().map((headerGroup) => (
              <DataTable.Row
                key={headerGroup.id}
                widthClassName={widthClassName}
              >
                {headerGroup.headers.map((header) => {
                  const breakpoint = columnsBreakpoints[header.id];
                  if (
                    !windowSize.width ||
                    !shouldRenderColumn(windowSize.width, breakpoint)
                  ) {
                    return null;
                  }

                  return (
                    <DataTable.Head
                      column={header.column}
                      key={header.id}
                      onClick={
                        isSorting && header.column.getCanSort()
                          ? header.column.getToggleSortingHandler()
                          : undefined
                      }
                      className={cn(
                        "max-w-0",
                        header.column.getCanSort() &&
                          isSorting &&
                          "cursor-pointer"
                      )}
                      style={{
                        width: columnSizing[header.id],
                        minWidth: columnSizing[header.id],
                      }}
                    >
                      <div className="flex w-full items-center space-x-1 whitespace-nowrap">
                        <span className="truncate">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                        </span>
                        {isSorting && header.column.getCanSort() && (
                          <Icon
                            visual={
                              header.column.getIsSorted() === "asc"
                                ? ArrowUp
                                : header.column.getIsSorted() === "desc"
                                  ? ArrowDown
                                  : ChevronSelectorVertical
                            }
                            size="xs"
                            className="ml-1"
                          />
                        )}
                      </div>
                    </DataTable.Head>
                  );
                })}
              </DataTable.Row>
            ))}
          </DataTable.Header>
          <DataTable.Body
            className="relative w-full"
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              const handleRowClick = () => {
                if (enableRowSelection && row.getCanSelect()) {
                  row.toggleSelected(
                    !enableMultiRowSelection ? true : undefined
                  );
                }
                row.original.onClick?.();
              };

              return (
                <DataTable.Row
                  key={row.id}
                  id={row.id}
                  widthClassName={widthClassName}
                  hideBottomBorder={hideRowDivider}
                  onClick={
                    enableRowSelection && !disableRowClickSelection
                      ? handleRowClick
                      : row.original.onClick
                  }
                  onDoubleClick={row.original.onDoubleClick}
                  rowData={row.original}
                  className="absolute w-full"
                  {...(enableRowSelection && {
                    "data-selected": row.getIsSelected(),
                  })}
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {row.getVisibleCells().map((cell) => {
                    const breakpoint = columnsBreakpoints[cell.column.id];
                    if (
                      !windowSize.width ||
                      !shouldRenderColumn(windowSize.width, breakpoint)
                    ) {
                      return null;
                    }

                    return (
                      <DataTable.Cell
                        column={cell.column}
                        key={cell.id}
                        id={cell.id}
                        className="max-w-0"
                        style={{
                          width: columnSizing[cell.column.id],
                          minWidth: columnSizing[cell.column.id],
                        }}
                      >
                        <div className="flex items-center space-x-1">
                          <span className="truncate">
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )}
                          </span>
                        </div>
                      </DataTable.Cell>
                    );
                  })}
                </DataTable.Row>
              );
            })}
          </DataTable.Body>
        </DataTable.Root>
        {/*sentinel div used for the intersection observer*/}
        <div ref={loadMoreRef} className="absolute bottom-0 h-1 w-full" />
        <div ref={scrollSentinelRef} className="h-px" />
      </div>

      <div
        className={cn(
          "pointer-events-none sticky -bottom-px left-0 right-0 -mt-10 h-10 bg-linear-to-t",
          "from-background via-background/60 to-transparent transition-opacity duration-300",
          canScrollDown ? "opacity-100" : "opacity-0"
        )}
      />

      {isLoading && (
        <div className="sticky bottom-0 left-0 right-0 flex justify-center bg-background/80 py-2 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner size="xs" />
            <span>Loading more data...</span>
          </div>
        </div>
      )}
    </div>
  );
}

interface DataTableRootProps extends React.HTMLAttributes<HTMLTableElement> {
  children: ReactNode;
  containerClassName?: string;
  containerProps?: React.HTMLAttributes<HTMLDivElement>;
}

/** The underlying table element with its container-query wrapper. */
DataTable.Root = function DataTableRoot({
  children,
  className,
  containerClassName,
  containerProps,
  ...props
}: DataTableRootProps) {
  return (
    <div
      className={cn("@container/table", containerClassName)}
      {...containerProps}
    >
      <table
        className={cn("w-full table-fixed border-collapse", className)}
        {...props}
      >
        {children}
      </table>
    </div>
  );
};

interface HeaderProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  children: ReactNode;
}

/** Table head section (thead). */
DataTable.Header = function Header({
  children,
  className,
  ...props
}: HeaderProps) {
  return (
    <thead className={cn(className)} {...props}>
      {children}
    </thead>
  );
};

interface HeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  children?: ReactNode;
  column: Column<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Header cell (th) with alignment and optional tooltip from the column meta. */
DataTable.Head = function Head({
  children,
  className,
  column,
  ...props
}: HeadProps) {
  return (
    <th
      className={cn(
        "heading-xs py-2 px-2 capitalize",
        column.columnDef.meta?.headerAlign === "right"
          ? "text-right"
          : column.columnDef.meta?.headerAlign === "center"
            ? "text-center"
            : "text-left",
        "text-foreground",
        column.columnDef.meta?.className,
        className
      )}
      {...props}
    >
      {column.columnDef.meta?.tooltip ? (
        <Tooltip label={column.columnDef.meta.tooltip} trigger={children} />
      ) : (
        children
      )}
    </th>
  );
};

/** Table body section (tbody). */
DataTable.Body = function Body({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={className} {...props}>
      {children}
    </tbody>
  );
};

interface RowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  children: ReactNode;
  onClick?: () => void;
  onDoubleClick?: () => void;
  widthClassName: string;
  "data-selected"?: boolean;
  rowData?: TBaseData;
  hideBottomBorder?: boolean;
}

/** Table row (tr) with hover/selection styling and a right-click context menu when rowData.menuItems is set. */
DataTable.Row = function Row({
  children,
  className,
  onClick,
  onDoubleClick,
  widthClassName,
  rowData,
  hideBottomBorder = false,
  ...props
}: RowProps) {
  const [contextMenuPosition, setContextMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const handleContextMenu = (event: React.MouseEvent) => {
    if (!rowData?.menuItems?.length) {
      return;
    }

    event.preventDefault();
    setContextMenuPosition({ x: event.clientX, y: event.clientY });
  };

  return (
    <>
      <tr
        className={cn(
          "group/dt-row justify-center transition-colors duration-300 ease-out",
          !hideBottomBorder && ["border-b", "border-separator"],
          (onClick || onDoubleClick) &&
            "cursor-pointer [&:hover:not(:has(input:hover)):not(:has(button:hover))]:bg-muted-background",
          props["data-selected"] && "bg-muted-background/50",
          widthClassName,
          className
        )}
        onClick={onClick || undefined}
        onDoubleClick={onDoubleClick || undefined}
        onContextMenu={handleContextMenu}
        {...props}
      >
        {children}
      </tr>

      {contextMenuPosition && rowData?.menuItems?.length && (
        <DropdownMenu
          open={!!contextMenuPosition}
          onOpenChange={(open) => !open && setContextMenuPosition(null)}
          modal
        >
          <DropdownMenuPortal>
            <DropdownMenuContent
              align="start"
              className="whitespace-nowrap"
              style={{
                position: "fixed",
                left: contextMenuPosition?.x || 0,
                top: contextMenuPosition?.y || 0,
              }}
            >
              <DropdownMenuGroup>
                {rowData?.menuItems?.map((item, index) =>
                  renderMenuItem(item, index, () =>
                    setContextMenuPosition(null)
                  )
                )}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenu>
      )}
    </>
  );
};

interface BaseMenuItem {
  kind: "item" | "submenu";
  label: string;
  disabled?: boolean;
}

interface RegularMenuItem
  extends BaseMenuItem,
    Omit<DropdownMenuItemProps, "children" | "label"> {
  kind: "item";
}

type SubmenuEntry = {
  id: string;
  name: string;
  checked?: boolean;
  description?: string;
};

interface SubmenuMenuItem extends BaseMenuItem {
  kind: "submenu";
  items: SubmenuEntry[];
  onSelect: (itemId: string) => void;
  selectionMode?: "default" | "checkbox";
}

export type MenuItem = RegularMenuItem | SubmenuMenuItem;

const preventMenuItemClickThrough = (event: React.PointerEvent) => {
  // Prevent the subsequent click from reaching elements behind the menu when
  // it closes on pointer down (modal={false}).
  event.preventDefault();
};

// Shared menu rendering functions
const renderSubmenuItem = (
  item: SubmenuMenuItem,
  index: number,
  onItemClick?: () => void
) => (
  <DropdownMenuSub key={`${item.label}-${index}`}>
    <DropdownMenuSubTrigger
      label={item.label}
      disabled={item.disabled}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    />
    <DropdownMenuPortal>
      <DropdownMenuSubContent>
        {item.selectionMode === "checkbox" ? (
          item.items.map((subItem) => (
            <DropdownMenuCheckboxItem
              key={subItem.id}
              label={subItem.name}
              description={subItem.description}
              checked={subItem.checked}
              onCheckedChange={(checked) => {
                if (!checked) {
                  return;
                }
                item.onSelect(subItem.id);
                onItemClick?.();
              }}
              onSelect={(event) => {
                event.preventDefault();
              }}
            />
          ))
        ) : (
          <ScrollArea className="flex max-h-72 min-w-24 flex-col" hideScrollBar>
            {item.items.map((subItem) => (
              <DropdownMenuItem
                key={subItem.id}
                label={subItem.name}
                description={subItem.description}
                onPointerDown={preventMenuItemClickThrough}
                onClick={(event) => {
                  event.stopPropagation();
                  item.onSelect(subItem.id);
                  onItemClick?.();
                }}
              />
            ))}
            <ScrollBar className="py-0" />
          </ScrollArea>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuPortal>
  </DropdownMenuSub>
);

const renderRegularItem = (
  item: RegularMenuItem,
  index: number,
  onItemClick?: () => void
) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { kind, ...itemProps } = item;
  return (
    <DropdownMenuItem
      key={`item-${index}`}
      {...itemProps}
      onPointerDown={preventMenuItemClickThrough}
      onClick={(event) => {
        event.stopPropagation();
        itemProps.onClick?.(event);
        onItemClick?.();
      }}
    />
  );
};

const renderMenuItem = (
  item: MenuItem,
  index: number,
  onItemClick?: () => void
) => {
  switch (item.kind) {
    case "submenu":
      return renderSubmenuItem(item, index, onItemClick);
    case "item":
      return renderRegularItem(item, index, onItemClick);
  }
};

export interface DataTableMoreButtonProps {
  className?: string;
  /** Menu entries — regular items or submenus (with default or checkbox selection). */
  menuItems?: MenuItem[];
  /** Extra props forwarded to the underlying DropdownMenu. */
  dropdownMenuProps?: Omit<
    React.ComponentPropsWithoutRef<typeof DropdownMenu>,
    "modal"
  >;
  disabled?: boolean;
}

/** "..." row-actions button that opens a dropdown of menuItems. */
DataTable.MoreButton = function MoreButton({
  className,
  menuItems,
  dropdownMenuProps,
  disabled,
}: DataTableMoreButtonProps) {
  const [open, setOpen] = useState(false);

  if (!menuItems?.length) {
    return null;
  }

  const { onOpenChange: dropdownOnOpenChange, ...restDropdownMenuProps } =
    dropdownMenuProps ?? {};

  const closeMenu = () => {
    setOpen(false);
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        dropdownOnOpenChange?.(nextOpen);
      }}
      modal={false}
      {...restDropdownMenuProps}
    >
      <DropdownMenuTrigger
        onClick={(event) => {
          event.stopPropagation();
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        asChild
      >
        <Button
          icon={DotsHorizontal}
          size="icon"
          variant="ghost-secondary"
          disabled={disabled}
          className={cn(disabled && "cursor-not-allowed opacity-50", className)}
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" hidden={disabled}>
        <DropdownMenuGroup>
          {menuItems.map((item, index) =>
            renderMenuItem(item, index, closeMenu)
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

interface CellProps extends React.HTMLAttributes<HTMLTableCellElement> {
  children: ReactNode;
  column: Column<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Body cell (td) with truncation and column meta styling. */
DataTable.Cell = function Cell({
  children,
  className,
  column,
  ...props
}: CellProps) {
  return (
    <td
      className={cn(
        cellHeight,
        "truncate px-2",
        column.columnDef.meta?.className,
        className
      )}
      {...props}
    >
      {children}
    </td>
  );
};

interface CellContentProps extends React.TdHTMLAttributes<HTMLDivElement> {
  avatarUrl?: string;
  avatarTooltipLabel?: string;
  icon?: React.ComponentType<{ className?: string }>;
  iconClassName?: string;
  roundedAvatar?: boolean;
  children?: ReactNode;
  description?: string;
  grow?: boolean;
  disabled?: boolean;
  avatarStack?: {
    items: { name: string; visual?: string | React.ReactNode }[];
    nbVisibleItems?: number;
  };
}

/** Standard cell layout with optional avatar, avatar stack, icon, and trailing description. */
DataTable.CellContent = function CellContent({
  children,
  className,
  avatarUrl,
  avatarTooltipLabel,
  roundedAvatar,
  icon,
  iconClassName,
  description,
  grow = false,
  disabled,
  avatarStack,
  ...props
}: CellContentProps) {
  return (
    <div
      className={cn(
        "flex items-center",
        grow ? "flex-grow" : "",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
      aria-disabled={disabled || undefined}
      {...props}
    >
      {avatarUrl && avatarTooltipLabel && (
        <Tooltip
          trigger={
            <Avatar
              visual={avatarUrl}
              size="xs"
              className="mr-2"
              isRounded={roundedAvatar ?? false}
            />
          }
          label={avatarTooltipLabel}
        />
      )}
      {avatarUrl && !avatarTooltipLabel && (
        <Avatar
          visual={avatarUrl}
          size="xs"
          className="mr-2"
          isRounded={roundedAvatar ?? false}
        />
      )}
      {avatarStack && (
        <Avatar.Stack
          avatars={avatarStack.items}
          nbVisibleItems={avatarStack.nbVisibleItems}
          size="xs"
        />
      )}
      {icon && (
        <Icon
          visual={icon}
          size="sm"
          className={cn("mr-2 text-foreground", iconClassName)}
        />
      )}
      <div
        className={cn(
          "flex shrink truncate items-center",
          grow ? "flex-grow" : ""
        )}
      >
        <div
          className={cn(
            grow ? "flex-grow" : "",
            "truncate text-sm",
            "text-foreground"
          )}
        >
          {children}
        </div>
        {description && (
          <span className={cn("pl-2 text-sm", "text-muted-foreground")}>
            {description}
          </span>
        )}
      </div>
    </div>
  );
};

interface BasicCellContentProps extends React.TdHTMLAttributes<HTMLDivElement> {
  label: string | number;
  tooltip?: string | number;
  textToCopy?: string | number;
  disabled?: boolean;
}

/** Simple muted text cell with an optional tooltip and hover copy-to-clipboard button. */
DataTable.BasicCellContent = function BasicCellContent({
  label,
  tooltip,
  className,
  textToCopy,
  disabled,
  ...props
}: BasicCellContentProps) {
  const [isCopied, copyToClipboard] = useCopyToClipboard();

  const handleCopy = async () => {
    const textToUse = textToCopy ?? String(label);
    void copyToClipboard(
      new ClipboardItem({
        "text/plain": new Blob([String(textToUse)], {
          type: "text/plain",
        }),
      })
    );
  };

  return (
    <>
      {tooltip ? (
        <Tooltip
          tooltipTriggerAsChild
          trigger={
            <div
              className={cn(
                cellHeight,
                "group flex items-center gap-2 text-sm",
                "text-muted-foreground",
                disabled && "cursor-not-allowed opacity-50",
                className
              )}
              aria-disabled={disabled || undefined}
              {...props}
            >
              <span className="truncate">{label}</span>
              {textToCopy && (
                <Button
                  icon={isCopied ? ClipboardCheck : Clipboard}
                  className="hidden group-hover:block"
                  variant="outline"
                  onClick={async (e) => {
                    e.stopPropagation();
                    await handleCopy();
                  }}
                  size="xs"
                />
              )}
            </div>
          }
          label={tooltip}
        />
      ) : (
        <div
          className={cn(
            cellHeight,
            "group flex items-center gap-2 text-sm",
            "text-muted-foreground",
            disabled && "cursor-not-allowed opacity-50",
            className
          )}
          aria-disabled={disabled || undefined}
          {...props}
        >
          <span className="truncate">{label}</span>
          {textToCopy && (
            <Button
              icon={isCopied ? ClipboardCheck : Clipboard}
              className="hidden group-hover:block"
              variant="outline"
              onClick={async (e) => {
                e.stopPropagation();
                await handleCopy();
              }}
              size="xs"
            />
          )}
        </div>
      )}
    </>
  );
};

interface CellContentWithCopyProps {
  children: React.ReactNode;
  textToCopy?: string;
  className?: string;
}

/** Cell content with a persistent copy-to-clipboard icon button. */
DataTable.CellContentWithCopy = function CellContentWithCopy({
  children,
  textToCopy,
  className,
}: CellContentWithCopyProps) {
  const [isCopied, copyToClipboard] = useCopyToClipboard();

  const handleCopy = async () => {
    void copyToClipboard(
      new ClipboardItem({
        "text/plain": new Blob([textToCopy ?? String(children)], {
          type: "text/plain",
        }),
      })
    );
  };

  return (
    <div className={cn("flex items-center space-x-2", className)}>
      <span className="truncate">{children}</span>
      <IconButton
        icon={isCopied ? ClipboardCheck : Clipboard}
        variant="outline"
        onClick={async (e) => {
          e.stopPropagation();
          await handleCopy();
        }}
        size="xs"
      />
    </div>
  );
};

/** Table caption element. */
DataTable.Caption = function Caption({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLTableCaptionElement>) {
  return (
    <caption className={className} {...props}>
      {children}
    </caption>
  );
};

interface SelectionColumnOptions {
  hideSelectAll?: boolean;
}

/** Builds a checkbox column for multi-row selection, with an optional select-all header. */
export function createSelectionColumn<TData>({
  hideSelectAll = false,
}: SelectionColumnOptions = {}): ColumnDef<TData> {
  return {
    id: "select",
    enableSorting: false,
    enableHiding: false,
    header: ({ table }) =>
      !hideSelectAll ? (
        <Checkbox
          checked={
            table.getIsAllRowsSelected()
              ? true
              : table.getIsSomeRowsSelected()
                ? "partial"
                : false
          }
          onCheckedChange={(state) => {
            if (state === "indeterminate") {
              return;
            }
            table.toggleAllRowsSelected(state);
          }}
        />
      ) : null,
    cell: ({ row }) => (
      <div className="flex h-full w-full items-center">
        <Checkbox
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onCheckedChange={(state) => {
            if (state === "indeterminate") {
              return;
            }
            row.toggleSelected(state);
          }}
        />
      </div>
    ),
    meta: {
      className: "w-10",
    },
  };
}

/** Builds a radio column for single-row selection. */
export function createRadioSelectionColumn<TData>(): ColumnDef<TData> {
  return {
    id: "radio-select",
    enableSorting: false,
    enableHiding: false,
    header: () => null,
    cell: ({ row }) => (
      <div className="flex h-full w-full items-center">
        <div
          className={cn(
            radioStyles(),
            row.getIsSelected() && "bg-muted/50",
            !row.getCanSelect() && "cursor-not-allowed opacity-50"
          )}
          aria-checked={row.getIsSelected()}
          role="radio"
        >
          {row.getIsSelected() && <div className={radioIndicatorStyles()} />}
        </div>
      </div>
    ),
    meta: {
      className: "w-10",
    },
  };
}
