import type {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
} from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useState } from "react";

import { PokeDataTableFacetedFilter } from "@app/components/poke/shadcn/ui/data_table_faceted_filter";
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

interface Facet {
  columnId: string;
  title: string;
  options: {
    label: string;
    value: string;
    icon?: React.ComponentType<{ className?: string }>;
  }[];
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  defaultFilterColumn?: string;
  isLoading?: boolean;
  facets?: Facet[];
  pageSize?: number;
}

export function PokeDataTable<TData, TValue>({
  data,
  columns,
  defaultFilterColumn,
  facets,
  isLoading,
  pageSize = 10,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    onSortingChange: setSorting,
    globalFilterFn: "includesString", // built-in filter function
    state: {
      columnFilters,
      sorting,
    },
    initialState: {
      globalFilter: "",
      pagination: {
        pageSize,
      },
    },
  });

  if (isLoading) {
    return <>Loading...</>;
  }

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center gap-4">
        <PokeInput
          name="filter"
          placeholder="Filter ..."
          value={
            defaultFilterColumn
              ? (table
                  .getColumn(defaultFilterColumn)
                  ?.getFilterValue() as string)
              : table.getState().globalFilter
          }
          onChange={(e) =>
            defaultFilterColumn
              ? table
                  .getColumn(defaultFilterColumn)
                  ?.setFilterValue(e.target.value)
              : table.setGlobalFilter(e.target.value)
          }
          className="max-w-sm"
        />
        {facets &&
          facets.map((facet) => (
            <PokeDataTableFacetedFilter
              key={facet.columnId}
              column={table.getColumn(facet.columnId)}
              title={facet.title}
              options={facet.options}
            />
          ))}
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
