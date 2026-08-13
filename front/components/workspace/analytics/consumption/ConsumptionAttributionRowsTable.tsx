import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import type { ConsumptionTopRow } from "@app/lib/api/analytics/consumption/top_rows";
import {
  ArrowDown,
  ArrowUp,
  ChevronSelectorVertical,
  Collapsible,
  CollapsibleContent,
  cn,
  DataTable,
  Icon,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Fragment } from "react";
import { ConsumptionAttributionBreakdown } from "./ConsumptionAttributionBreakdown";
import type { ConsumptionDimension } from "./consumptionDimensions";

export type AttributionRowData = ConsumptionTopRow & {
  isExpanded: boolean;
  onClick: () => void;
};

interface ConsumptionAttributionRowsTableProps {
  data: AttributionRowData[];
  columns: ColumnDef<AttributionRowData>[];
  workspaceId: string;
  dimension: ConsumptionDimension;
  period: ConsumptionPeriodSelection;
  filter?: ConsumptionScopeFilter;
}

export function ConsumptionAttributionRowsTable({
  data,
  columns,
  workspaceId,
  dimension,
  period,
  filter,
}: ConsumptionAttributionRowsTableProps) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <DataTable.Root className="min-w-150">
      <DataTable.Header>
        {table.getHeaderGroups().map((headerGroup) => (
          <DataTable.Row key={headerGroup.id} widthClassName="w-full">
            {headerGroup.headers.map((header) => (
              <DataTable.Head
                column={header.column}
                key={header.id}
                onClick={
                  header.column.getCanSort()
                    ? header.column.getToggleSortingHandler()
                    : undefined
                }
                className={cn(header.column.getCanSort() && "cursor-pointer")}
              >
                <div
                  className={cn(
                    "flex items-center space-x-1 whitespace-nowrap",
                    header.column.columnDef.meta?.headerAlign === "right" &&
                      "justify-end"
                  )}
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext()
                  )}
                  {header.column.getCanSort() && (
                    <Icon
                      visual={
                        header.column.getIsSorted() === "asc"
                          ? ArrowUp
                          : header.column.getIsSorted() === "desc"
                            ? ArrowDown
                            : ChevronSelectorVertical
                      }
                      size="xs"
                      className="ml-1"
                    />
                  )}
                </div>
              </DataTable.Head>
            ))}
          </DataTable.Row>
        ))}
      </DataTable.Header>
      <DataTable.Body>
        {table.getRowModel().rows.map((row) => (
          <Fragment key={row.id}>
            <DataTable.Row
              widthClassName="w-full"
              onClick={row.original.onClick}
              rowData={row.original}
            >
              {row.getVisibleCells().map((cell) => (
                <DataTable.Cell column={cell.column} key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </DataTable.Cell>
              ))}
            </DataTable.Row>
            <tr>
              <td className="max-w-0" colSpan={row.getVisibleCells().length}>
                <Collapsible open={row.original.isExpanded}>
                  <CollapsibleContent
                    animated={false}
                    className={cn(
                      "transition-none ease-enter motion-reduce:animate-none",
                      "data-[state=open]:animate-in data-[state=open]:fade-in-0",
                      "data-[state=open]:slide-in-from-top-1 data-[state=open]:duration-enter",
                      "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
                      "data-[state=closed]:slide-out-to-top-1 data-[state=closed]:duration-exit"
                    )}
                  >
                    <ConsumptionAttributionBreakdown
                      workspaceId={workspaceId}
                      selectedDimension={dimension}
                      selectedRowId={row.original.id}
                      period={period}
                      filter={filter}
                    />
                  </CollapsibleContent>
                </Collapsible>
              </td>
            </tr>
          </Fragment>
        ))}
      </DataTable.Body>
    </DataTable.Root>
  );
}
