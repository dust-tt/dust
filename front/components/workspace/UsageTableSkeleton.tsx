import { ChevronSelectorVertical, cn, Icon } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { ComponentType } from "react";

export interface UsageTableSkeletonCellProps {
  columnId: string;
  rowIndex: number;
}

interface UsageTableSkeletonProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  SkeletonCell: ComponentType<UsageTableSkeletonCellProps>;
  rowCount?: number;
  rowHeight?: number;
}

/**
 * @cc [owner:aubin-tchoi,label:react] content-specific-skeleton-cells
 * Callers MUST reuse their loaded table's column definitions and provide a
 * SkeletonCell that matches each column's content shape, including icons,
 * avatars, text lines, and controls where present.
 */
export function UsageTableSkeleton<TData, TValue = string>({
  columns,
  SkeletonCell,
  rowCount = 5,
  rowHeight = 48,
}: UsageTableSkeletonProps<TData, TValue>) {
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
