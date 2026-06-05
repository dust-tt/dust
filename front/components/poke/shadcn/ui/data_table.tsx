import { PokeDataTableFacetedFilter } from "@app/components/poke/shadcn/ui/data_table_faceted_filter";
import { PokeDataTablePagination } from "@app/components/poke/shadcn/ui/pagination";
import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableHead,
  PokeTableHeader,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import { Input } from "@dust-tt/sparkle";
import type {
  ColumnDef,
  ColumnFiltersState,
  PaginationState,
  SortingState,
  Updater,
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
  // Server-side (manual) mode. When `serverSideRowCount` is provided,
  // pagination and sorting are controlled by the caller and applied
  // server-side (the `data` prop is the current page only). Otherwise the
  // table paginates/sorts/filters the full `data` set client-side as before.
  serverSideRowCount?: number;
  pagination?: PaginationState;
  onPaginationChange?: (pagination: PaginationState) => void;
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  // When provided, the filter box drives server-side search (controlled by the
  // caller) instead of the built-in client-side global filter.
  search?: string;
  onSearchChange?: (search: string) => void;
}

export function PokeDataTable<TData, TValue>({
  data,
  columns,
  defaultFilterColumn,
  facets,
  isLoading,
  pageSize = 10,
  serverSideRowCount,
  pagination,
  onPaginationChange,
  sorting,
  onSortingChange,
  search,
  onSearchChange,
}: DataTableProps<TData, TValue>) {
  const isServerSide = serverSideRowCount !== undefined;
  const isServerSearch = onSearchChange !== undefined;

  const [internalSorting, setInternalSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const resolvedSorting = isServerSide ? (sorting ?? []) : internalSorting;

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onColumnFiltersChange: setColumnFilters,
    globalFilterFn: "includesString", // built-in filter function
    manualPagination: isServerSide,
    manualSorting: isServerSide,
    ...(isServerSide
      ? { rowCount: serverSideRowCount }
      : { getSortedRowModel: getSortedRowModel() }),
    onSortingChange: isServerSide
      ? (updater: Updater<SortingState>) => {
          const next =
            typeof updater === "function" ? updater(resolvedSorting) : updater;
          onSortingChange?.(next);
        }
      : setInternalSorting,
    ...(isServerSide
      ? {
          onPaginationChange: (updater: Updater<PaginationState>) => {
            const current = pagination ?? { pageIndex: 0, pageSize };
            const next =
              typeof updater === "function" ? updater(current) : updater;
            onPaginationChange?.(next);
          },
        }
      : {}),
    state: {
      columnFilters,
      sorting: resolvedSorting,
      ...(isServerSide && pagination ? { pagination } : {}),
    },
    initialState: {
      globalFilter: "",
      ...(isServerSide ? {} : { pagination: { pageSize } }),
    },
  });

  if (isLoading) {
    return <>Loading...</>;
  }

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center gap-4">
        {isServerSearch ? (
          <Input
            name="search"
            placeholder="Search ..."
            value={search ?? ""}
            onChange={(e) => onSearchChange?.(e.target.value)}
            className="max-w-sm"
          />
        ) : (
          <Input
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
        )}
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
