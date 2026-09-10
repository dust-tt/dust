import { cn, LoadingBlock } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

interface UsageTableSkeletonProps<TData> {
  columns: ColumnDef<TData, string>[];
  headerHeight?: number;
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
  headerHeight = 16,
  rowCount = 5,
  rowHeight = 48,
}: UsageTableSkeletonProps<TData>) {
  return (
    <div role="status" aria-label="Loading table" aria-busy="true">
      <div aria-hidden="true" className="@container/table">
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr className="border-b border-separator">
              {columns.map((column, index) => (
                <th
                  key={index}
                  className={cn("px-2 py-2", column.meta?.className)}
                >
                  <div
                    className={cn(
                      "flex items-center",
                      column.id === "modelTiers" ? "h-6" : "h-4"
                    )}
                    style={{ minHeight: headerHeight }}
                  >
                    <LoadingBlock
                      className={cn(
                        "h-3 w-2/3 max-w-24",
                        column.meta?.headerAlign === "right" && "ml-auto",
                        column.meta?.headerAlign === "center" && "mx-auto"
                      )}
                    />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
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
    </div>
  );
}
