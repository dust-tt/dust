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

import { Avatar } from "@sparkle/components/Avatar";
import {
  DropdownItemProps,
  DropdownMenu,
} from "@sparkle/components/DropdownMenu";
import { IconButton } from "@sparkle/components/IconButton";
import { Pagination } from "@sparkle/components/Pagination";
import { Tooltip } from "@sparkle/components/Tooltip";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ClipboardCheckIcon,
  ClipboardIcon,
  MoreIcon,
} from "@sparkle/icons";
import { classNames, useCopyToClipboard } from "@sparkle/lib/utils";

import { Icon } from "./Icon";
import { breakpoints, useWindowSize } from "./WindowUtility";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    className?: string;
    width?: string;
    flex?: number;
  }
}

interface TBaseData {
  onClick?: () => void;
  moreMenuItems?: DropdownItemProps[];
}

interface ColumnBreakpoint {
  [columnId: string]: "xs" | "sm" | "md" | "lg" | "xl";
}

interface DataTableProps<TData extends TBaseData> {
  data: TData[];
  totalRowCount?: number;
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
  columns,
  className,
  widthClassName = "s-w-full s-max-w-4xl",
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
    <div
      className={classNames(
        "s-flex s-flex-col s-gap-2",
        className || "",
        widthClassName
      )}
    >
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
                    className={classNames(
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
                          className={classNames(
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
              moreMenuItems={row.original.moreMenuItems}
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
            pagination={table.getState().pagination}
            setPagination={table.setPagination}
            rowCount={table.getRowCount()}
          />
        </div>
      )}
    </div>
  );
}

interface DataTableRootProps extends React.HTMLAttributes<HTMLTableElement> {
  children: ReactNode;
}

DataTable.Root = function DataTableRoot({
  children,
  ...props
}: DataTableRootProps) {
  return (
    <table className="s-w-full s-border-collapse" {...props}>
      {children}
    </table>
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
    <thead
      className={classNames("s-text-xs s-capitalize", className || "")}
      {...props}
    >
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
      style={getSize(column.columnDef)}
      className={classNames(
        "s-py-1 s-pr-3 s-text-left s-font-medium s-text-element-800",
        className || ""
      )}
      {...props}
    >
      {children}
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
  moreMenuItems?: DropdownItemProps[];
  widthClassName: string;
}

DataTable.Row = function Row({
  children,
  className,
  onClick,
  moreMenuItems,
  widthClassName,
  ...props
}: RowProps) {
  return (
    <tr
      className={classNames(
        "s-group/dt s-flex s-items-center s-border-b s-border-structure-200 s-text-sm s-transition-colors s-duration-300 s-ease-out",
        onClick ? "s-cursor-pointer hover:s-bg-structure-50" : "",
        widthClassName,
        className || ""
      )}
      onClick={onClick ? onClick : undefined}
      {...props}
    >
      {children}
      <td className="s-flex s-w-8 s-cursor-pointer s-items-center s-pl-1 s-text-element-600">
        {moreMenuItems && moreMenuItems.length > 0 && (
          <DropdownMenu className="s-mr-1.5 s-flex">
            <DropdownMenu.Button>
              <IconButton
                icon={MoreIcon}
                size="sm"
                variant="tertiary"
                className="s-m-1"
              />
            </DropdownMenu.Button>
            <DropdownMenu.Items origin="topRight" width={220}>
              {moreMenuItems?.map((item, index) => (
                <DropdownMenu.Item key={index} {...item} />
              ))}
            </DropdownMenu.Items>
          </DropdownMenu>
        )}
      </td>
    </tr>
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
  column.columnDef.minSize;
  return (
    <td
      style={getSize(column.columnDef)}
      className={classNames(
        "s-flex s-h-12 s-items-center s-truncate s-whitespace-nowrap s-pl-1.5 s-text-element-800",
        column.columnDef.meta?.className || "",
        className || ""
      )}
      {...props}
    >
      {children}
    </td>
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSize(columnDef: ColumnDef<any>) {
  if (columnDef.meta?.width) {
    return { width: columnDef.meta.width };
  }
  return {
    flex: columnDef.meta?.flex ?? 1,
  };
}

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
    <div
      className={classNames(
        "s-flex s-w-full s-items-center s-py-2",
        className || ""
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
          className={classNames(
            "s-mr-2 s-text-element-800",
            iconClassName || ""
          )}
        />
      )}
      <div className="s-flex s-shrink s-truncate">
        <span className="s-truncate s-text-sm s-text-element-800">
          {children}
        </span>
        {description && (
          <span className="s-pl-2 s-text-sm s-text-element-600">
            {description}
          </span>
        )}
      </div>
    </div>
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
    <div
      className={classNames(
        "s-flex s-items-center s-space-x-2",
        className || ""
      )}
    >
      <span className="s-truncate">{children}</span>
      <IconButton
        icon={isCopied ? ClipboardCheckIcon : ClipboardIcon}
        variant="tertiary"
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
