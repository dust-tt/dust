import { Icon } from "@sparkle/components/Icon";
import { ChevronSelectorVertical } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import React, { type ComponentType } from "react";

export interface DataTableSkeletonCellProps {
  /** The column id from the table definition. */
  columnId: string;
  /** Zero-based placeholder row index, for varying shapes across rows. */
  rowIndex: number;
}

export interface DataTableSkeletonProps<TData, TValue = string> {
  /** Reuse the loaded table columns, including header alignment and width classes. */
  columns: ColumnDef<TData, TValue>[];
  /** Required cell renderer: compose LoadingBlocks to match each column's content. */
  SkeletonCell: ComponentType<DataTableSkeletonCellProps>;
  /** Number of placeholder rows. Defaults to 5. */
  rowCount?: number;
  /** Row height in pixels; match the loaded table. Defaults to 48. */
  rowHeight?: number;
}

/**
 * A loading table that reuses the loaded table's column definitions and requires
 * a custom SkeletonCell renderer. Compose LoadingBlocks for each column to match
 * its real content, such as circular avatars, badges, or multiple text lines.
 */
export function DataTableSkeleton<TData, TValue = string>({
  columns,
  SkeletonCell,
  rowCount = 5,
  rowHeight = 48,
}: DataTableSkeletonProps<TData, TValue>) {
  const table = useReactTable({
    data: [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="@container/table">
      <table
        aria-label="Loading table"
        aria-busy="true"
        className="w-full table-fixed border-collapse"
      >
        <thead>
          <tr className="border-b border-separator">
            {table.getFlatHeaders().map((header) => (
              <th
                key={header.id}
                className={cn(
                  "heading-xs px-2 py-2 text-left capitalize text-foreground",
                  header.column.columnDef.meta?.className
                )}
              >
                <div
                  className={cn(
                    "flex items-center space-x-1 whitespace-nowrap",
                    header.column.columnDef.meta?.headerAlign === "right" &&
                      "justify-end",
                    header.column.columnDef.meta?.headerAlign === "center" &&
                      "justify-center"
                  )}
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext()
                  )}
                  {header.column.getCanSort() && (
                    <Icon
                      visual={ChevronSelectorVertical}
                      size="xs"
                      className="ml-1"
                    />
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody aria-hidden="true">
          {Array.from({ length: rowCount }, (_, rowIndex) => (
            <tr key={rowIndex} className="border-b border-separator">
              {table.getAllLeafColumns().map((column) => (
                <td
                  key={column.id}
                  className={cn("px-2", column.columnDef.meta?.className)}
                  style={{ height: rowHeight }}
                >
                  <SkeletonCell columnId={column.id} rowIndex={rowIndex} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
