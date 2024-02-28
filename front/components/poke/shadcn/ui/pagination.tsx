import { ArrowLeftIcon, ArrowRightIcon, IconButton } from "@dust-tt/sparkle";
import type { Table } from "@tanstack/react-table";

interface DataTablePaginationProps<TData> {
  table: Table<TData>;
}

export function DataTablePagination<TData>({
  table,
}: DataTablePaginationProps<TData>) {
  return (
    <div className="flex items-center justify-between px-2">
      <div className="text-muted-foreground flex-1 text-sm">
        Total of {table.getFilteredRowModel().rows.length} row(s).
      </div>
      <div className="flex items-center space-x-6 lg:space-x-8">
        <div className="font-sm flex w-[100px] items-center justify-center text-sm">
          Page {table.getState().pagination.pageIndex + 1} of{" "}
          {table.getPageCount()}
        </div>
        <div className="flex items-center space-x-2">
          <IconButton
            icon={ArrowLeftIcon}
            className="h-8 w-8 p-0"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          />
          <IconButton
            icon={ArrowRightIcon}
            className="h-8 w-8 p-0"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          />
        </div>
      </div>
    </div>
  );
}
