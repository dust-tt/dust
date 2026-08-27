import { AutomationsTriggerBreakdown } from "@app/components/workspace/analytics/automations/AutomationsTriggerBreakdown";
import type { AutomationsScope } from "@app/hooks/useAutomationsTriggerBreakdown";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import type { AutomationTriggerRow } from "@app/lib/api/analytics/automations/triggers";
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
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Fragment } from "react";

// The id sparkle's createSelectionColumn gives its checkbox column.
const SELECTION_COLUMN_ID = "select";

const NO_ROW_SELECTION: RowSelectionState = {};

export type TriggerRowData = AutomationTriggerRow & {
  onClick: () => void;
};

interface TriggerSkeletonCellProps {
  columnId: string;
  rowIndex: number;
}

function TriggerSkeletonCell({ columnId, rowIndex }: TriggerSkeletonCellProps) {
  switch (columnId) {
    case "name":
      return (
        <div className="flex h-12 items-center">
          <LoadingBlock
            className={cn(
              "h-3",
              ["w-32", "w-48", "w-28", "w-40", "w-36"][rowIndex % 5]
            )}
          />
        </div>
      );
    case "editor":
      return (
        <div className="flex h-12 items-center gap-2">
          <LoadingBlock className="h-7 w-7 shrink-0 rounded-full" />
          <LoadingBlock
            className={cn(
              "h-3",
              ["w-16", "w-20", "w-14", "w-24"][rowIndex % 4]
            )}
          />
        </div>
      );
    case "agent":
      return (
        <div className="flex h-12 items-center gap-2">
          <LoadingBlock className="h-5 w-5 shrink-0 rounded-sm" />
          <LoadingBlock
            className={cn(
              "h-3",
              ["w-20", "w-28", "w-16", "w-24"][rowIndex % 4]
            )}
          />
        </div>
      );
    case "type":
      return (
        <div className="flex h-12 items-center justify-center">
          <LoadingBlock className="h-4 w-4" />
        </div>
      );
    case "credits":
      return (
        <div className="flex h-12 items-center justify-end">
          <LoadingBlock
            className={cn(
              "h-3",
              ["w-10", "w-14", "w-12", "w-16"][rowIndex % 4]
            )}
          />
        </div>
      );
    case "pool":
      return (
        <div className="flex h-12 items-center">
          <LoadingBlock className="h-6 w-20 rounded-[9px]" />
        </div>
      );
    case SELECTION_COLUMN_ID:
      return (
        <div className="flex h-12 items-center">
          <LoadingBlock className="h-4 w-4 rounded-sm" />
        </div>
      );
    case "status":
      return (
        <div className="flex h-12 items-center justify-center">
          <LoadingBlock className="h-5 w-8 rounded-full" />
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

interface AutomationsTriggersRowsTableProps<T extends TriggerRowData> {
  data: T[];
  columns: ColumnDef<T>[];
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  scope: AutomationsScope;
  expandedRowId: string | null;
  medianRunCount: number;
  medianCostPerRun: number;
  isLoading?: boolean;
  skeletonRowCount: number;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: (selection: RowSelectionState) => void;
}

export function AutomationsTriggersRowsTable<T extends TriggerRowData>({
  data,
  columns,
  workspaceId,
  period,
  scope,
  expandedRowId,
  medianRunCount,
  medianCostPerRun,
  isLoading = false,
  skeletonRowCount,
  rowSelection = NO_ROW_SELECTION,
  onRowSelectionChange,
}: AutomationsTriggersRowsTableProps<T>) {
  const table = useReactTable({
    data,
    columns,
    state: { rowSelection },
    enableRowSelection: true,
    onRowSelectionChange: (updater) =>
      onRowSelectionChange?.(
        typeof updater === "function" ? updater(rowSelection) : updater
      ),
    getRowId: (row) => row.triggerId,
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
                      "justify-end",
                    header.column.columnDef.meta?.headerAlign === "center" &&
                      "justify-center"
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
          ? Array.from({ length: skeletonRowCount }, (_, rowIndex) => (
              <DataTable.Row
                key={rowIndex}
                widthClassName="w-full"
                aria-hidden="true"
              >
                {table.getAllLeafColumns().map((column) => (
                  <DataTable.Cell column={column} key={column.id}>
                    <TriggerSkeletonCell
                      columnId={column.id}
                      rowIndex={rowIndex}
                    />
                  </DataTable.Cell>
                ))}
              </DataTable.Row>
            ))
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
                    <Collapsible
                      open={expandedRowId === row.original.triggerId}
                    >
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
                        <AutomationsTriggerBreakdown
                          workspaceId={workspaceId}
                          scope={scope}
                          trigger={row.original}
                          period={period}
                          medianRunCount={medianRunCount}
                          medianCostPerRun={medianCostPerRun}
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
