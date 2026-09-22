import { Spinner } from "@sparkle/components/Spinner";
import { cn } from "@sparkle/lib/utils";
import {
  flexRender,
  getCoreRowModel,
  type RowSelectionState,
  type SortingState,
  type Updater,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useWindowSize } from "../WindowUtility";
import { Cell } from "./cells";
import type { DataTableProps, TBaseData } from "./DataTable";
import { shouldRenderColumn } from "./DataTable";
import {
  DATA_TABLE_ROW_HEIGHT_PX,
  type DataTableLayout,
  DataTableLayoutContext,
  DEFAULT_DATA_TABLE_LAYOUT,
} from "./layout";
import { Body, Head, Header, Root, Row } from "./parts";
import { getDataTableColumnPresets } from "./presets";
export interface ScrollableDataTableProps<TData extends TBaseData>
  extends Omit<
    DataTableProps<TData>,
    | "onLoadMore"
    | "isLoadingMore"
    | "isLoading"
    | "emptyState"
    | "stickyHeader"
    | "maxHeight"
    | "horizontalScroll"
  > {
  /** Height of the scroll container: a max-height class name, true to fill the parent (flex-1), or unset for the default max-h-100. */
  maxHeight?: string | boolean;
  /** Called when the user scrolls near the bottom — use it for infinite loading. */
  onLoadMore?: () => void;
  /** Shows a "Loading more data..." footer and pauses onLoadMore triggers. */
  isLoading?: boolean;
  /** Ref to the scrollable container element. */
  containerRef?: React.Ref<HTMLDivElement>;
}

const MIN_COLUMN_WIDTH = 40;

/**
 * Virtualized DataTable for large or infinite datasets: rows are windowed with
 * TanStack Virtual, with a sticky header and infinite loading via onLoadMore.
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
  density = "default",
  getRowLabel,
}: ScrollableDataTableProps<TData>) {
  const windowSize = useWindowSize();
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const scrollSentinelRef = useRef<HTMLDivElement>(null);
  const [tableWidth, setTableWidth] = useState(0);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);

  const isSorting = !!setSorting;

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
    ...(getRowLabel && { meta: { getRowLabel } }),
  });

  useEffect(() => {
    if (!tableContainerRef.current || !table || !tableWidth) {
      return;
    }
    const columns = table.getAllColumns();

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

    const totalIdealWidth = Object.values(idealSizing).reduce(
      (a, b) => a + b,
      0
    );
    const widthDifference = tableWidth - totalIdealWidth;

    // Rounding leftovers go to the widest column.
    if (widthDifference !== 0) {
      const adjustColumnId = Object.entries(idealSizing).sort(
        (a, b) => b[1] - a[1]
      )[0][0];

      idealSizing[adjustColumnId] += widthDifference;
    }
    table.setColumnSizing(idealSizing);
  }, [table, tableWidth]);

  const columnSizing = table.getState().columnSizing;

  const { rows } = table.getRowModel();
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => DATA_TABLE_ROW_HEIGHT_PX[density],
  });

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!onLoadMore || !node) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
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

    observer.observe(node);

    return () => {
      observer.unobserve(node);
      observer.disconnect();
    };
  }, [onLoadMore, isLoading]);

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

  const layout = useMemo<DataTableLayout>(
    () => ({ ...DEFAULT_DATA_TABLE_LAYOUT, density }),
    [density]
  );

  return (
    <DataTableLayoutContext.Provider value={layout}>
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
          <Root className="w-full table-fixed">
            <Header className="sticky top-0 z-20 bg-background shadow-sm">
              {table.getHeaderGroups().map((headerGroup) => (
                <Row key={headerGroup.id} widthClassName={widthClassName}>
                  {headerGroup.headers.map((header) => {
                    const breakpoint = columnsBreakpoints[header.id];
                    if (
                      !windowSize.width ||
                      !shouldRenderColumn(windowSize.width, breakpoint)
                    ) {
                      return null;
                    }

                    const canSort =
                      isSorting &&
                      header.column.getCanSort() &&
                      getDataTableColumnPresets(header.column).sortable;
                    const headerContent = (
                      <span className="truncate">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                      </span>
                    );
                    return (
                      <Head
                        column={header.column}
                        key={header.id}
                        onSort={
                          canSort
                            ? header.column.getToggleSortingHandler()
                            : undefined
                        }
                        className="max-w-0"
                        style={{
                          width: columnSizing[header.id],
                          minWidth: columnSizing[header.id],
                        }}
                      >
                        {canSort ? (
                          headerContent
                        ) : (
                          <div className="flex w-full items-center gap-1 whitespace-nowrap">
                            {headerContent}
                          </div>
                        )}
                      </Head>
                    );
                  })}
                </Row>
              ))}
            </Header>
            <Body
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
                  <Row
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
                        <Cell
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
                        </Cell>
                      );
                    })}
                  </Row>
                );
              })}
            </Body>
          </Root>
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
    </DataTableLayoutContext.Provider>
  );
}
