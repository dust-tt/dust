import {
  type ColumnDef,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import React, { ReactNode, useState } from "react";

import { Avatar, MoreIcon } from "@sparkle/index";
import { ArrowDownIcon, ArrowUpIcon } from "@sparkle/index";
import { classNames } from "@sparkle/lib/utils";

import { Icon } from "./Icon";

type FirstColumnWidth = "expanded" | "normal";

interface TableProps<TData, TValue> {
  data: TData[];
  columns: ColumnDef<TData, TValue>[];
  className?: string;
  width?: FirstColumnWidth;
}

export function Table<TData, TValue>({
  data,
  columns,
  className,
  width = "normal",
}: TableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnFiltersChange: setColumnFilters,
    state: {
      columnFilters,
      sorting,
    },
  });

  return (
    <TableData className={className}>
      <TableData.Header>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableData.Row key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableData.Head
                key={header.id}
                width={width}
                onClick={header.column.getToggleSortingHandler()}
                className={header.column.getCanSort() ? "s-cursor-pointer" : ""}
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
                      className={classNames(
                        "s-h-4 s-w-3 s-font-extralight",
                        header.column.getIsSorted()
                          ? "s-opacity-100"
                          : "s-opacity-0"
                      )}
                    />
                  )}
                </div>
              </TableData.Head>
            ))}
          </TableData.Row>
        ))}
      </TableData.Header>
      <TableData.Body>
        {table.getRowModel().rows.map((row) => (
          <TableData.Row
            key={row.id}
            clickable={row.original.clickable}
            onClick={row.original.onClick}
          >
            {row.getVisibleCells().map((cell) => (
              <TableData.Cell key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableData.Cell>
            ))}
          </TableData.Row>
        ))}
      </TableData.Body>
    </TableData>
  );
}

interface TableRootProps extends React.HTMLAttributes<HTMLTableElement> {
  children: ReactNode;
}

interface HeaderProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  children: ReactNode;
}

interface HeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  children?: ReactNode;
  width?: FirstColumnWidth;
}

interface CellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  avatarUrl?: string;
  icon?: React.ComponentType<{ className?: string }>;
  children?: ReactNode;
  description?: string;
}

interface RowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  children: ReactNode;
  clickable?: boolean;
  onClick?: () => void;
}

const TableRoot: React.FC<TableRootProps> = ({
  children,
  className,
  ...props
}) => {
  return (
    <table
      className={classNames("s-w-full s-border-collapse", className || "")}
      {...props}
    >
      {children}
    </table>
  );
};

const Header: React.FC<HeaderProps> = ({ children, className, ...props }) => {
  return (
    <thead
      className={classNames("s-text-xs s-capitalize", className || "")}
      {...props}
    >
      {children}
    </thead>
  );
};

const Head: React.FC<HeadProps> = ({
  children,
  className,
  width,
  ...props
}) => {
  return (
    <th
      className={classNames(
        "s-py-1 s-pr-3 s-text-left s-font-medium s-text-element-800",
        width === "expanded" ? "s-w-full" : "s-w-auto",
        className || ""
      )}
      {...props}
    >
      <div className="s-flex s-items-center s-space-x-1 s-whitespace-nowrap">
        {children}
      </div>
    </th>
  );
};

const Body: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({
  children,
  className,
  ...props
}) => (
  <tbody className={className || ""} {...props}>
    {children}
  </tbody>
);

const Footer: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({
  children,
  className,
  ...props
}) => (
  <tfoot
    className={classNames(
      "s-border-t s-border-structure-200 s-bg-structure-50",
      className || ""
    )}
    {...props}
  >
    {children}
  </tfoot>
);

const Row: React.FC<RowProps> = ({
  children,
  className,
  clickable = false,
  onClick,
  ...props
}) => (
  <tr
    className={classNames(
      "s-border-b s-border-structure-200 s-text-sm",
      className || ""
    )}
    {...props}
  >
    {children}
    {clickable && (
      <td
        className="s-w-1 s-cursor-pointer s-pl-1 s-text-element-600"
        onClick={clickable ? onClick : undefined}
      >
        <Icon visual={MoreIcon} size="sm" />
      </td>
    )}
  </tr>
);

const Cell: React.FC<CellProps> = ({
  children,
  className,
  avatarUrl,
  icon,
  description,
  ...props
}) => (
  <td
    className={classNames(
      "s-whitespace-nowrap s-py-2 s-pl-0.5 s-text-element-800",
      className || ""
    )}
    {...props}
  >
    <div className="s-flex">
      {avatarUrl && <Avatar visual={avatarUrl} size="xs" className="s-mr-2" />}
      {icon && (
        <Icon visual={icon} size="sm" className="s-mr-2 s-text-element-600" />
      )}
      <div className="s-flex">
        <span className="s-text-sm s-text-element-800">{children}</span>
        {description && (
          <span className="s-pl-2 s-text-sm s-text-element-600">
            {description}
          </span>
        )}
      </div>
    </div>
  </td>
);

const Caption: React.FC<React.HTMLAttributes<HTMLTableCaptionElement>> = ({
  children,
  className,
  ...props
}) => (
  <caption className={classNames(className || "")} {...props}>
    {children}
  </caption>
);

export const TableData = Object.assign(TableRoot, {
  Header,
  Body,
  Footer,
  Head,
  Row,
  Cell,
  Caption,
});
