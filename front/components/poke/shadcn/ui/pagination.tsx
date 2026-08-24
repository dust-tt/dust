import { ArrowLeft, ArrowRight, IconButton } from "@dust-tt/sparkle";
import type { Table } from "@tanstack/react-table";

interface DataTablePaginationProps<TData> {
  table: Table<TData>;
}

export function PokeDataTablePagination<TData>({
  table,
}: DataTablePaginationProps<TData>) {
  const pageCount = Math.max(1, table.getPageCount());
  const currentPage = Math.min(
    table.getState().pagination.pageIndex + 1,
    pageCount
  );

  return (
    <div className="flex items-center justify-between px-2">
      <div className="flex-1 text-sm text-muted-foreground">
        Total of{" "}
        {table.options.manualPagination
          ? table.getRowCount()
          : table.getFilteredRowModel().rows.length}{" "}
        row(s).
      </div>
      <div className="flex items-center space-x-6 lg:space-x-8">
        <div className="font-sm flex w-[100px] items-center justify-center text-sm">
          Page {currentPage} of {pageCount}
        </div>
        <div className="flex items-center space-x-2">
          <IconButton
            aria-label="Previous page"
            icon={ArrowLeft}
            className="h-8 w-8 p-0"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          />
          <IconButton
            aria-label="Next page"
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
