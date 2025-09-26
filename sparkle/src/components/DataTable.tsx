import {
  Column,
  type ColumnDef,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  PaginationState,
  Row,
  RowSelectionState,
  type SortingState,
  Updater,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import React, { ReactNode, useEffect, useRef, useState } from "react";

import {
  Avatar,
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuItemProps,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Icon,
  IconButton,
  Pagination,
  ScrollArea,
  ScrollBar,
  Spinner,
  Tooltip,
} from "@sparkle/components";
import {
  radioIndicatorStyles,
  radioStyles,
} from "@sparkle/components/RadioGroup";
import { useCopyToClipboard } from "@sparkle/hooks";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ClipboardCheckIcon,
  ClipboardIcon,
  MoreIcon,
} from "@sparkle/icons/app";
import { cn } from "@sparkle/lib/utils";

import { breakpoints, useWindowSize } from "./WindowUtility";

const cellHeight = "s-h-12";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    className?: string;
    tooltip?: string;
    sizeRatio?: number;
  }
}

interface TBaseData {
  onClick?: () => void;
  onDoubleClick?: () => void;
  dropdownMenuProps?: React.ComponentPropsWithoutRef<typeof DropdownMenu>;
  menuItems?: MenuItem[];
}

interface ColumnBreakpoint {
  [columnId: string]: "xs" | "sm" | "md" | "lg" | "xl";
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
  totalRowCount?: number;
  rowCountIsCapped?: boolean;
  columns: ColumnDef<TData, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  className?: string;
  widthClassName?: string;
  filter?: string;
  filterColumn?: string;
  pagination?: PaginationState;
  setPagination?: (pagination: PaginationState) => void;
  columnsBreakpoints?: ColumnBreakpoint;
  sorting?: SortingState;
  setSorting?: (sorting: SortingState) => void;
  isServerSideSorting?: boolean;
  disablePaginationNumbers?: boolean;
  getRowId?: (
    originalRow: TData,
    index: number,
    parent?: Row<TData> | undefined
  ) => string;
  // row selection props
  rowSelection?: RowSelectionState;
  setRowSelection?: (rowSelection: RowSelectionState) => void;
  enableRowSelection?: boolean | ((row: Row<TData>) => boolean);
  enableMultiRowSelection?: boolean;
  enableSortingRemoval?: boolean;
}

export function DataTable<TData extends TBaseData>({
  data,
  totalRowCount,
  rowCountIsCapped = false,
  columns,
  className,
  widthClassName = "s-w-full",
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

  useEffect(() => {
    if (filterColumn) {
      table.getColumn(filterColumn)?.setFilterValue(filter);
    }
  }, [filter, filterColumn]);

  return (
    <div className={cn("s-flex s-flex-col s-gap-2", className, widthClassName)}>
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
                      header.column.getCanSort() && "s-cursor-pointer"
                    )}
                  >
                    <div className="s-flex s-items-center s-space-x-1 s-whitespace-nowrap">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                      {header.column.getCanSort() && (
                        <Icon
                          visual={
                            header.column.getIsSorted() === "asc"
                              ? ArrowUpIcon
                              : ArrowDownIcon
                          }
                          size="xs"
                          className={cn(
                            "s-ml-1",
                            header.column.getIsSorted()
                              ? "s-opacity-100"
                              : "s-opacity-0"
                          )}
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
                onClick={
                  enableRowSelection ? handleRowClick : row.original.onClick
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
        <div className="s-p-1">
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
  maxHeight?: string | boolean;
  onLoadMore?: () => void;
  isLoading?: boolean;
  containerRef?: React.Ref<HTMLDivElement>;
}

// cellHeight in pixels
const COLUMN_HEIGHT = 48;
const MIN_COLUMN_WIDTH = 40;

export function ScrollableDataTable<TData extends TBaseData>({
  data,
  totalRowCount,
  columns,
  className,
  widthClassName = "s-w-full",
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
}: ScrollableDataTableProps<TData>) {
  const windowSize = useWindowSize();
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [tableWidth, setTableWidth] = useState(0);
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

  return (
    <div
      className={cn(
        "s-relative s-overflow-y-auto s-overflow-x-hidden",
        className,
        widthClassName,
        maxHeight === true
          ? "s-flex-1"
          : typeof maxHeight === "string"
            ? maxHeight
            : "s-max-h-100"
      )}
      ref={setRef}
    >
      <div className="s-relative">
        <DataTable.Root className="s-w-full s-table-fixed">
          <DataTable.Header className="s-sticky s-top-0 s-z-20 s-bg-white s-shadow-sm dark:s-bg-background-night">
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
                        "s-max-w-0",
                        header.column.getCanSort() &&
                          isSorting &&
                          "s-cursor-pointer"
                      )}
                      style={{
                        width: columnSizing[header.id],
                        minWidth: columnSizing[header.id],
                      }}
                    >
                      <div className="s-flex s-w-full s-items-center s-space-x-1 s-whitespace-nowrap">
                        <span className="s-truncate">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                        </span>
                        {isSorting && header.column.getCanSort() && (
                          <Icon
                            visual={
                              header.column.getIsSorted() === "asc"
                                ? ArrowUpIcon
                                : ArrowDownIcon
                            }
                            size="xs"
                            className={cn(
                              "s-ml-1",
                              header.column.getIsSorted()
                                ? "s-opacity-100"
                                : "s-opacity-0"
                            )}
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
            className="s-relative s-w-full"
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
                  onClick={
                    enableRowSelection ? handleRowClick : row.original.onClick
                  }
                  onDoubleClick={row.original.onDoubleClick}
                  rowData={row.original}
                  className="s-absolute s-w-full"
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
                        className="s-max-w-0"
                        style={{
                          width: columnSizing[cell.column.id],
                          minWidth: columnSizing[cell.column.id],
                        }}
                      >
                        <div className="s-flex s-items-center s-space-x-1">
                          <span className="s-truncate">
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
        <div
          ref={loadMoreRef}
          className="s-absolute s-bottom-0 s-h-1 s-w-full"
        />
      </div>

      {isLoading && (
        <div className="s-sticky s-bottom-0 s-left-0 s-right-0 s-flex s-justify-center s-bg-white/80 s-py-2 s-backdrop-blur-sm dark:s-bg-background-night/80">
          <div className="s-flex s-items-center s-gap-2 s-text-sm s-text-muted-foreground">
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

DataTable.Root = function DataTableRoot({
  children,
  className,
  containerClassName,
  containerProps,
  ...props
}: DataTableRootProps) {
  return (
    <div
      className={cn("s-@container/table", containerClassName)}
      {...containerProps}
    >
      <table
        className={cn("s-w-full s-table-fixed s-border-collapse", className)}
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

DataTable.Head = function Head({
  children,
  className,
  column,
  ...props
}: HeadProps) {
  return (
    <th
      className={cn(
        "s-py-2 s-pl-2 s-pr-3 s-text-left s-text-xs s-font-semibold s-capitalize",
        "s-text-foreground dark:s-text-foreground-night",
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
}

DataTable.Row = function Row({
  children,
  className,
  onClick,
  onDoubleClick,
  widthClassName,
  rowData,
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
          "s-group/dt-row s-justify-center s-border-b s-transition-colors s-duration-300 s-ease-out",
          "s-border-separator dark:s-border-separator-night",
          (onClick || onDoubleClick) &&
            "s-cursor-pointer [&:hover:not(:has(input:hover)):not(:has(button:hover))]:s-bg-muted dark:[&:hover:not(:has(input:hover)):not(:has(button:hover))]:s-bg-muted-night",
          props["data-selected"] && "s-bg-muted/50 dark:s-bg-muted/50",
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
              className="s-whitespace-nowrap"
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
};

interface SubmenuMenuItem extends BaseMenuItem {
  kind: "submenu";
  items: SubmenuEntry[];
  onSelect: (itemId: string) => void;
}

export type MenuItem = RegularMenuItem | SubmenuMenuItem;

// Shared menu rendering functions
const renderSubmenuItem = (
  item: SubmenuMenuItem,
  index: number,
  onItemClick?: () => void
) => (
  <DropdownMenuSub key={`${item.label}-${index}`}>
    <DropdownMenuSubTrigger label={item.label} disabled={item.disabled} />
    <DropdownMenuPortal>
      <DropdownMenuSubContent>
        <ScrollArea
          className="s-min-w-24 s-flex s-max-h-72 s-flex-col"
          hideScrollBar
        >
          {item.items.map((subItem) => (
            <DropdownMenuItem
              key={subItem.id}
              label={subItem.name}
              onClick={(event) => {
                event.stopPropagation();
                item.onSelect(subItem.id);
                onItemClick?.();
              }}
            />
          ))}
          <ScrollBar className="s-py-0" />
        </ScrollArea>
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
  menuItems?: MenuItem[];
  dropdownMenuProps?: Omit<
    React.ComponentPropsWithoutRef<typeof DropdownMenu>,
    "modal"
  >;
}

DataTable.MoreButton = function MoreButton({
  className,
  menuItems,
  dropdownMenuProps,
}: DataTableMoreButtonProps) {
  if (!menuItems?.length) {
    return null;
  }

  return (
    <DropdownMenu modal={false} {...dropdownMenuProps}>
      <DropdownMenuTrigger
        onClick={(event) => {
          event.stopPropagation();
        }}
        asChild
      >
        <Button
          icon={MoreIcon}
          size="mini"
          variant="ghost-secondary"
          className={cn(className)}
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          {menuItems.map((item, index) => renderMenuItem(item, index))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

interface CellProps extends React.HTMLAttributes<HTMLTableCellElement> {
  children: ReactNode;
  column: Column<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

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
        "s-truncate s-pl-2",
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
}

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
  ...props
}: CellContentProps) {
  return (
    <div
      className={cn(
        "s-flex s-items-center",
        grow ? "s-flex-grow" : "",
        className
      )}
      {...props}
    >
      {avatarUrl && avatarTooltipLabel && (
        <Tooltip
          trigger={
            <Avatar
              visual={avatarUrl}
              size="xs"
              className="s-mr-2"
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
          className="s-mr-2"
          isRounded={roundedAvatar ?? false}
        />
      )}
      {icon && (
        <Icon
          visual={icon}
          size="sm"
          className={cn(
            "s-mr-2 s-text-foreground dark:s-text-foreground-night",
            iconClassName
          )}
        />
      )}
      <div
        className={cn("s-flex s-shrink s-truncate", grow ? "s-flex-grow" : "")}
      >
        <div
          className={cn(
            grow ? "s-flex-grow" : "",
            "s-truncate s-text-sm",
            "s-text-foreground dark:s-text-foreground-night"
          )}
        >
          {children}
        </div>
        {description && (
          <span
            className={cn(
              "s-pl-2 s-text-sm",
              "s-text-muted-foreground dark:s-text-muted-foreground-night"
            )}
          >
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
}

DataTable.BasicCellContent = function BasicCellContent({
  label,
  tooltip,
  className,
  textToCopy,
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
                "s-group s-flex s-items-center s-gap-2 s-text-sm",
                "s-text-muted-foreground dark:s-text-muted-foreground-night",
                className
              )}
              {...props}
            >
              <span className="s-truncate">{label}</span>
              {textToCopy && (
                <Button
                  icon={isCopied ? ClipboardCheckIcon : ClipboardIcon}
                  className="s-hidden group-hover:s-block"
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
            "s-group s-flex s-items-center s-gap-2 s-text-sm",
            "s-text-muted-foreground dark:s-text-muted-foreground-night",
            className
          )}
          {...props}
        >
          <span className="s-truncate">{label}</span>
          {textToCopy && (
            <Button
              icon={isCopied ? ClipboardCheckIcon : ClipboardIcon}
              className="s-hidden group-hover:s-block"
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
    <div className={cn("s-flex s-items-center s-space-x-2", className)}>
      <span className="s-truncate">{children}</span>
      <IconButton
        icon={isCopied ? ClipboardCheckIcon : ClipboardIcon}
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

export function createSelectionColumn<TData>(): ColumnDef<TData> {
  return {
    id: "select",
    enableSorting: false,
    enableHiding: false,
    header: ({ table }) => (
      <Checkbox
        size="xs"
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
    ),
    cell: ({ row }) => (
      <div className="s-flex s-h-full s-w-full s-items-center">
        <Checkbox
          size="xs"
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
      className: "s-w-10",
    },
  };
}

export function createRadioSelectionColumn<TData>(): ColumnDef<TData> {
  return {
    id: "radio-select",
    enableSorting: false,
    enableHiding: false,
    header: () => null,
    cell: ({ row }) => (
      <div className="s-flex s-h-full s-w-full s-items-center">
        <div
          className={cn(
            radioStyles({ size: "xs" }),
            row.getIsSelected() && "s-bg-muted/50 dark:s-bg-muted/50",
            !row.getCanSelect() && "s-cursor-not-allowed s-opacity-50"
          )}
          aria-checked={row.getIsSelected()}
          role="radio"
        >
          {row.getIsSelected() && (
            <div className={radioIndicatorStyles({ size: "xs" })} />
          )}
        </div>
      </div>
    ),
    meta: {
      className: "s-w-10",
    },
  };
}
