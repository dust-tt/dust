import { cn, DataTable, LoadingBlock } from "@dust-tt/sparkle";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { ReactNode } from "react";

interface UsageTableSkeletonProps<TData> {
  columns: ColumnDef<TData, string>[];
  label: string;
  rowCount?: number;
  sorting?: SortingState;
  showPagination?: boolean;
  showLoadMore?: boolean;
  renderCell: (columnId: string, rowIndex: number) => ReactNode;
}

interface SkeletonRow {
  onClick?: () => void;
}

/**
 * @cc [owner:aubin-tchoi,label:react] usage-table-loading-geometry
 * Loading rows must retain the destination table's headers, column widths,
 * responsive visibility and row height. Placeholder rows must not be selectable.
 */
export function UsageTableSkeleton<TData>({
  columns,
  label,
  rowCount = 5,
  sorting,
  showPagination = false,
  showLoadMore = false,
  renderCell,
}: UsageTableSkeletonProps<TData>) {
  const table = useReactTable({
    data: [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  const skeletonColumns: ColumnDef<SkeletonRow, string>[] = table
    .getFlatHeaders()
    .map((header) => ({
      id: header.id,
      meta: header.column.columnDef.meta,
      header: () =>
        header.id === "select" ? (
          <LoadingBlock className="h-4 w-4 rounded-sm" />
        ) : (
          flexRender(header.column.columnDef.header, header.getContext())
        ),
      accessorFn: () => "",
      enableSorting: header.column.getCanSort(),
      cell: ({ row }) => (
        <div
          className={cn(
            "flex items-center",
            header.column.columnDef.meta?.headerAlign === "right" &&
              "justify-end",
            header.column.columnDef.meta?.headerAlign === "center" &&
              "justify-center"
          )}
        >
          {renderCell(header.id, row.index)}
        </div>
      ),
    }));

  return (
    <div role="status" aria-label={label} aria-busy="true">
      <div
        // React 18 does not type the native inert attribute yet.
        {...{ inert: "" }}
        aria-hidden="true"
        className="pointer-events-none flex flex-col gap-2"
      >
        <DataTable
          data={Array.from({ length: rowCount }, () => ({}))}
          columns={skeletonColumns}
          sorting={sorting}
          isServerSideSorting
        />
        {(showPagination || showLoadMore) && (
          <div className="p-1">
            <div
              className={cn(
                "flex items-center",
                showPagination ? "h-6" : "h-4",
                showPagination ? "justify-end" : "justify-between"
              )}
            >
              {showLoadMore && <LoadingBlock className="h-3 w-16" />}
              <LoadingBlock className="h-3 w-14" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
