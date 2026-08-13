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
  LoadingBlock,
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

const ATTRIBUTION_SKELETON_ROW_COUNT = 10;

interface AttributionSkeletonCellProps {
  columnId: string;
  rowIndex: number;
  hasAvatar: boolean;
  isAvatarRounded: boolean;
}

function AttributionSkeletonCell({
  columnId,
  rowIndex,
  hasAvatar,
  isAvatarRounded,
}: AttributionSkeletonCellProps) {
  switch (columnId) {
    case "name":
      return (
        <div className="flex h-12 items-center gap-2">
          {hasAvatar && (
            <LoadingBlock
              className={cn(
                "h-7 w-7 shrink-0",
                isAvatarRounded ? "rounded-full" : "rounded-md"
              )}
            />
          )}
          <LoadingBlock
            className={cn(
              "h-3",
              ["w-28", "w-36", "w-24", "w-40", "w-32"][rowIndex % 5]
            )}
          />
        </div>
      );
    case "costShare":
      return (
        <div className="flex h-12 items-center gap-2">
          <LoadingBlock className="h-1.5 w-24 rounded-full" />
          <LoadingBlock className="h-3 w-7" />
        </div>
      );
    case "credits":
    case "avgCredits":
      return (
        <div className="flex h-12 items-center justify-end">
          <LoadingBlock
            className={cn(
              "h-3",
              ["w-16", "w-12", "w-20", "w-14"][rowIndex % 4]
            )}
          />
        </div>
      );
    case "details":
      return (
        <div className="flex h-12 items-center justify-end">
          <LoadingBlock className="h-4 w-4" />
        </div>
      );
    default:
      return null;
  }
}

interface ConsumptionAttributionRowsTableProps {
  data: AttributionRowData[];
  columns: ColumnDef<AttributionRowData>[];
  workspaceId: string;
  dimension: ConsumptionDimension;
  period: ConsumptionPeriodSelection;
  filter?: ConsumptionScopeFilter;
  onViewAll: (
    dimension: ConsumptionDimension,
    selectedRow: ConsumptionTopRow
  ) => void;
  isLoading?: boolean;
  hasAvatar?: boolean;
  isAvatarRounded?: boolean;
}

export function ConsumptionAttributionRowsTable({
  data,
  columns,
  workspaceId,
  dimension,
  period,
  filter,
  onViewAll,
  isLoading = false,
  hasAvatar = false,
  isAvatarRounded = false,
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
        {isLoading
          ? Array.from(
              { length: ATTRIBUTION_SKELETON_ROW_COUNT },
              (_, rowIndex) => (
                <DataTable.Row
                  key={rowIndex}
                  widthClassName="w-full"
                  aria-hidden="true"
                >
                  {table.getAllLeafColumns().map((column) => (
                    <DataTable.Cell column={column} key={column.id}>
                      <AttributionSkeletonCell
                        columnId={column.id}
                        rowIndex={rowIndex}
                        hasAvatar={hasAvatar}
                        isAvatarRounded={isAvatarRounded}
                      />
                    </DataTable.Cell>
                  ))}
                </DataTable.Row>
              )
            )
          : table.getRowModel().rows.map((row) => (
              <Fragment key={row.id}>
                <DataTable.Row
                  widthClassName="w-full"
                  onClick={row.original.onClick}
                  rowData={row.original}
                >
                  {row.getVisibleCells().map((cell) => (
                    <DataTable.Cell column={cell.column} key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </DataTable.Cell>
                  ))}
                </DataTable.Row>
                <tr>
                  <td
                    className="max-w-0"
                    colSpan={row.getVisibleCells().length}
                  >
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
                          selectedRow={row.original}
                          period={period}
                          filter={filter}
                          onViewAll={onViewAll}
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
