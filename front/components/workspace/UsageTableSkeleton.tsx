import {
  ChevronSelectorVertical,
  cn,
  Icon,
  LoadingBlock,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

interface UsageTableSkeletonProps<TData> {
  columns: ColumnDef<TData, string>[];
  rowCount?: number;
  rowHeight?: number;
}

/**
 * @cc [owner:aubin-tchoi,label:react] usage-table-loading-geometry
 * Skeleton cells must use the destination columns' width and responsive
 * visibility classes. Placeholders must not be interactive.
 */
export function UsageTableSkeleton<TData>({
  columns,
  rowCount = 5,
  rowHeight = 48,
}: UsageTableSkeletonProps<TData>) {
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
              {columns.map((column, columnIndex) => (
                <td
                  key={columnIndex}
                  className={cn("px-2", column.meta?.className)}
                  style={{ height: rowHeight }}
                >
                  <LoadingBlock
                    className={cn(
                      "h-3 w-2/3 max-w-32",
                      column.meta?.headerAlign === "right" && "ml-auto",
                      column.meta?.headerAlign === "center" && "mx-auto"
                    )}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
