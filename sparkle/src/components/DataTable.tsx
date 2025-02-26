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
  type SortingState,
  Updater,
  useReactTable,
} from "@tanstack/react-table";
import React, { ReactNode, useEffect, useState } from "react";

import {
  Avatar,
  Button,
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
  IconButton,
  Pagination,
  ScrollArea,
  ScrollBar,
  Tooltip,
} from "@sparkle/components";
import { useCopyToClipboard } from "@sparkle/hooks";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ClipboardCheckIcon,
  ClipboardIcon,
  MoreIcon,
} from "@sparkle/icons";
import { cn } from "@sparkle/lib/utils";

import { Icon } from "./Icon";
import { breakpoints, useWindowSize } from "./WindowUtility";

const cellHeight = "s-h-12";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    className?: string;
    tooltip?: string;
  }
}

interface TBaseData {
  onClick?: () => void;
  moreMenuItems?: DropdownMenuItemProps[];
  dropdownMenuProps?: React.ComponentPropsWithoutRef<typeof DropdownMenu>;
}

interface ColumnBreakpoint {
  [columnId: string]: "xs" | "sm" | "md" | "lg" | "xl";
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

  const table = useReactTable({
    data,
    columns,
    rowCount: totalRowCount,
    manualPagination: isServerSidePagination,
    manualSorting: isServerSideSorting,
    ...(isServerSideSorting && {
      onSortingChange: onSortingChange,
    }),
    getCoreRowModel: getCoreRowModel(),
    ...(!isServerSideSorting && {
      getSortedRowModel: getSortedRowModel(),
      enableSorting: isClientSideSortingEnabled,
    }),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: pagination ? getPaginationRowModel() : undefined,
    onColumnFiltersChange: setColumnFilters,
    state: {
      columnFilters,
      ...(isServerSideSorting && {
        sorting,
      }),
      pagination,
    },
    initialState: {
      sorting,
    },
    onPaginationChange,
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
                    onClick={header.column.getToggleSortingHandler()}
                    className={cn(
                      header.column.getCanSort() ? "s-cursor-pointer" : ""
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
                              : header.column.getIsSorted() === "desc"
                                ? ArrowDownIcon
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
          {table.getRowModel().rows.map((row) => (
            <DataTable.Row
              widthClassName={widthClassName}
              key={row.id}
              onClick={row.original.onClick}
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
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </DataTable.Cell>
                );
              })}
            </DataTable.Row>
          ))}
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
          />
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
        "s-py-2 s-pl-2 s-pr-3 s-text-left s-text-xs s-font-medium s-capitalize",
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
  widthClassName: string;
}

DataTable.Row = function Row({
  children,
  className,
  onClick,
  widthClassName,
  ...props
}: RowProps) {
  return (
    <tr
      className={cn(
        "s-group/dt s-border-b s-transition-colors s-duration-300 s-ease-out",
        "s-border-separator dark:s-border-separator-night",
        onClick
          ? "s-cursor-pointer hover:s-bg-muted dark:hover:s-bg-muted-night"
          : "",
        widthClassName,
        className
      )}
      onClick={onClick ? onClick : undefined}
      {...props}
    >
      {children}
    </tr>
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

  const renderSubmenuItem = (item: SubmenuMenuItem, index: number) => (
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
                }}
              />
            ))}
            <ScrollBar className="s-py-0" />
          </ScrollArea>
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );

  const renderRegularItem = (item: RegularMenuItem, index: number) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { kind, ...itemProps } = item;
    return (
      <DropdownMenuItem
        key={`item-${index}`}
        {...itemProps}
        onClick={(event) => {
          event.stopPropagation();
          itemProps.onClick?.(event);
        }}
      />
    );
  };

  const renderMenuItem = (item: MenuItem, index: number) => {
    switch (item.kind) {
      case "submenu":
        return renderSubmenuItem(item, index);
      case "item":
        return renderRegularItem(item, index);
    }
  };

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
        <DropdownMenuGroup>{menuItems.map(renderMenuItem)}</DropdownMenuGroup>
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
  ...props
}: CellContentProps) {
  return (
    <div className={cn("s-flex s-items-center", className)} {...props}>
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
      <div className="s-flex s-shrink s-truncate">
        <span
          className={cn(
            "s-truncate s-text-sm",
            "s-text-foreground dark:s-text-foreground-night"
          )}
        >
          {children}
        </span>
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
