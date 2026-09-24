import { DataTable } from "@dust-tt/sparkle";
import type { TBaseData } from "@sparkle/components/DataTable/DataTable";
import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";

export type Col<T> = {
  key: string;
  header: string;
  className?: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
};

/** A thin wrapper turning simple column specs into a sparkle DataTable. */
export function SimpleTable<T extends TBaseData & { id: string }>({
  rows,
  cols,
  emptyState,
}: {
  rows: T[];
  cols: Col<T>[];
  emptyState?: ReactNode;
}) {
  const columns: ColumnDef<T, unknown>[] = cols.map((c) => ({
    id: c.key,
    header: c.header,
    enableSorting: false,
    accessorFn: (row: T) => (row as Record<string, unknown>)[c.key],
    meta: { className: c.className, headerAlign: c.align ?? "left" },
    cell: (info) => (
      <DataTable.CellContent
        className={
          c.align === "right"
            ? "w-full justify-end text-right"
            : "w-full justify-start text-left"
        }
      >
        {c.render(info.row.original)}
      </DataTable.CellContent>
    ),
  }));
  return (
    <DataTable
      data={rows}
      columns={columns}
      getRowId={(row) => row.id}
      emptyState={emptyState}
    />
  );
}

/** Plain text table for attribution rows (share, credits, messages, credits/message). */
export function AttributionTable({
  label,
  rows,
}: {
  label: string;
  rows: string[][];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted-background text-left text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">{label}</th>
            <th className="px-4 py-2 text-right font-medium">Share</th>
            <th className="px-4 py-2 text-right font-medium">Credits</th>
            <th className="px-4 py-2 text-right font-medium">Messages</th>
            <th className="px-4 py-2 text-right font-medium">Credits / msg</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r[0]} className="text-foreground">
              <td className="px-4 py-2 font-medium">{r[0]}</td>
              {r.slice(1).map((v, i) => (
                <td key={i} className="px-4 py-2 text-right tabular-nums">
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
