import { DataTable } from "@dust-tt/sparkle";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { useMemo } from "react";

/**
 * DataTable rows must be objects of its own shape (`onClick` and friends), so each SQL row is
 * carried in a wrapper rather than handed over directly.
 */
interface RowWrapper {
  cells: Record<string, unknown>;
  onClick?: () => void;
}

interface PodDatabaseRowsTableProps {
  columns: string[];
  rows: Record<string, unknown>[];
  /** Total rows in the underlying table; enables server-side paging when it exceeds `rows`. */
  totalRowCount?: number;
  pagination?: PaginationState;
  setPagination?: (pagination: PaginationState) => void;
}

/**
 * Render a SQL result set. Columns are only known at runtime, so the column definitions are built
 * from the result's column names rather than declared statically.
 */
export function PodDatabaseRowsTable({
  columns,
  rows,
  totalRowCount,
  pagination,
  setPagination,
}: PodDatabaseRowsTableProps) {
  const columnDefs = useMemo<ColumnDef<RowWrapper>[]>(
    () =>
      columns.map((name) => ({
        id: name,
        accessorFn: (row: RowWrapper) => row.cells[name],
        header: name,
        cell: ({ row }) => <CellValue value={row.original.cells[name]} />,
      })),
    [columns]
  );

  const data = useMemo<RowWrapper[]>(
    () => rows.map((cells) => ({ cells })),
    [rows]
  );

  return (
    <DataTable
      columns={columnDefs}
      data={data}
      totalRowCount={totalRowCount}
      pagination={pagination}
      setPagination={setPagination}
    />
  );
}

/**
 * SQLite values arrive as JSON: integers beyond the safe range and BLOBs are already strings
 * (base64 for BLOBs), so everything that is not null renders as text.
 */
function CellValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="italic text-muted-foreground">NULL</span>;
  }
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return (
    <span className="truncate font-mono text-xs" title={text}>
      {text}
    </span>
  );
}
