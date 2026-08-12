import type { ConsumptionTopRow } from "@app/hooks/useConsumptionTop";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
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
    <DataTable.Root className="min-w-[800px]">
      <DataTable.Header>
        {table.getHeaderGroups().map((headerGroup) => (
          <DataTable.Row key={headerGroup.id} widthClassName="min-w-[800px]">
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
              widthClassName="min-w-[800px]"
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
              <td colSpan={row.getVisibleCells().length}>
                <Collapsible open={row.original.isExpanded}>
                  <CollapsibleContent>
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
