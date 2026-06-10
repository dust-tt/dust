import { ArrowLeft, ArrowRight, IconButton } from "@dust-tt/sparkle";
import type { Table } from "@tanstack/react-table";

interface DataTablePaginationProps<TData> {
  table: Table<TData>;
}

export function PokeDataTablePagination<TData>({
  table,
}: DataTablePaginationProps<TData>) {
  return (
    <div className="flex items-center justify-between px-2">
      <div className="flex-1 text-sm text-muted-foreground dark:text-muted-foreground-night">
        Total of{" "}
        {table.options.manualPagination
          ? table.getRowCount()
          : table.getFilteredRowModel().rows.length}{" "}
        row(s).
      </div>
      <div className="flex items-center space-x-6 lg:space-x-8">
        <div className="font-sm flex w-[100px] items-center justify-center text-sm">
          Page {table.getState().pagination.pageIndex + 1} of{" "}
          {table.getPageCount()}
        </div>
        <div className="flex items-center space-x-2">
          <IconButton
            icon={ArrowLeft}
            className="h-8 w-8 p-0"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          />
          <IconButton
            icon={ArrowRight}
            className="h-8 w-8 p-0"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          />
        </div>
      </div>
    </div>
  );
}
