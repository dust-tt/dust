import type {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
} from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useState } from "react";

import { PokeInput } from "@app/components/poke/shadcn/ui/input";
import { PokeDataTablePagination } from "@app/components/poke/shadcn/ui/pagination";
import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableHead,
  PokeTableHeader,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean;
}

export function PokeDataTable<TData, TValue>({
  columns,
  data,
  isLoading,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onColumnFiltersChange: setColumnFilters,
    onSortingChange: setSorting,
    state: {
      columnFilters,
      sorting,
    },
  });

  if (isLoading) {
    return <>Loading...</>;
  }

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center">
        <PokeInput
          name="filter"
          placeholder="Filter ..."
          value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
          onChange={(e) =>
            table.getColumn("name")?.setFilterValue(e.target.value)
          }
          className="max-w-sm"
        />
      </div>
      <div className="rounded-md border">
        <PokeTable>
          <PokeTableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <PokeTableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <PokeTableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </PokeTableHead>
                  );
                })}
              </PokeTableRow>
            ))}
          </PokeTableHeader>
          <PokeTableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <PokeTableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <PokeTableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </PokeTableCell>
                  ))}
                </PokeTableRow>
              ))
            ) : (
              <PokeTableRow>
                <PokeTableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results.
                </PokeTableCell>
              </PokeTableRow>
            )}
          </PokeTableBody>
        </PokeTable>
        <PokeDataTablePagination table={table} />
      </div>
    </div>
  );
}
