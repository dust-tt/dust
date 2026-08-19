import {
  CostShareCell,
  CreditsGrowthCell,
} from "@app/components/workspace/analytics/creditsTableCells";
import { useAutomationsApiKeys } from "@app/hooks/useAutomationsApiKeys";
import { useDebounce } from "@app/hooks/useDebounce";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import type { ConsumptionTopApiKeyRow } from "@app/lib/api/analytics/consumption/top_api_keys";
import { formatCredits } from "@app/lib/client/credits";
import {
  ArrowDown,
  ArrowUp,
  ChevronSelectorVertical,
  cn,
  DataTable,
  DataTableLoadingSkeleton,
  Icon,
  Pagination,
  SearchInput,
} from "@dust-tt/sparkle";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

const SEARCH_DEBOUNCE_DELAY_MS = 300;
const API_KEYS_PAGE_SIZE = 25;
const API_KEYS_MAX_ROW_COUNT = 1_000;

function buildColumns(
  totalCredits: number
): ColumnDef<ConsumptionTopApiKeyRow>[] {
  return [
    {
      id: "name",
      accessorKey: "name",
      header: "Name",
      meta: { sizeRatio: 28, headerAlign: "left" },
      cell: (info) => (
        <DataTable.CellContent className="w-full justify-start text-left">
          <span className="truncate text-sm">{info.row.original.name}</span>
        </DataTable.CellContent>
      ),
    },
    {
      id: "costShare",
      header: "Cost share",
      meta: { sizeRatio: 20, headerAlign: "left" },
      cell: (info) => (
        <DataTable.CellContent className="w-full justify-start">
          <CostShareCell
            share={
              totalCredits > 0 ? info.row.original.credits / totalCredits : 0
            }
          />
        </DataTable.CellContent>
      ),
    },
    {
      id: "messageCount",
      accessorKey: "messageCount",
      header: "Messages",
      meta: { sizeRatio: 16, headerAlign: "right" },
      cell: (info) => (
        <DataTable.BasicCellContent
          className="justify-end text-right tabular-nums"
          label={info.row.original.messageCount.toLocaleString()}
        />
      ),
    },
    {
      id: "credits",
      accessorKey: "credits",
      header: "Total credits",
      meta: { sizeRatio: 18, headerAlign: "right" },
      cell: (info) => (
        <DataTable.BasicCellContent
          className="justify-end text-right tabular-nums"
          label={formatCredits(info.row.original.credits)}
        />
      ),
    },
    {
      id: "avgCreditsPerMessage",
      accessorKey: "avgCreditsPerMessage",
      header: "Cost / message",
      meta: { sizeRatio: 20, headerAlign: "right" },
      cell: (info) => (
        <DataTable.BasicCellContent
          className="justify-end text-right tabular-nums"
          label={formatCredits(info.row.original.avgCreditsPerMessage)}
        />
      ),
    },
    {
      id: "vsPrev",
      header: "vs prev",
      meta: { sizeRatio: 16, headerAlign: "right" },
      cell: (info) => (
        <CreditsGrowthCell
          credits={info.row.original.credits}
          previousCredits={info.row.original.previousCredits}
        />
      ),
    },
  ];
}

interface ApiKeysRowsTableProps {
  rows: ConsumptionTopApiKeyRow[];
  totalCredits: number;
}

function ApiKeysRowsTable({ rows, totalCredits }: ApiKeysRowsTableProps) {
  const columns = useMemo(() => buildColumns(totalCredits), [totalCredits]);
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <DataTable.Root className="min-w-175">
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
          <DataTable.Row key={row.id} widthClassName="w-full">
            {row.getVisibleCells().map((cell) => (
              <DataTable.Cell column={cell.column} key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </DataTable.Cell>
            ))}
          </DataTable.Row>
        ))}
      </DataTable.Body>
    </DataTable.Root>
  );
}

interface AutomationsApiKeysTableProps {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
}

export function AutomationsApiKeysTable({
  workspaceId,
  period,
}: AutomationsApiKeysTableProps) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: API_KEYS_PAGE_SIZE,
  });
  const { inputValue, debouncedValue, setValue } = useDebounce("", {
    delay: SEARCH_DEBOUNCE_DELAY_MS,
  });

  const [previousQuery, setPreviousQuery] = useState({
    period,
    search: debouncedValue,
  });
  if (
    previousQuery.period !== period ||
    previousQuery.search !== debouncedValue
  ) {
    setPreviousQuery({ period, search: debouncedValue });
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  }

  const {
    apiKeys,
    totalCredits,
    totalCount,
    isApiKeysLoading,
    isApiKeysError,
    isApiKeysValidating,
  } = useAutomationsApiKeys({
    workspaceId,
    period,
    limit: pagination.pageSize,
    offset: pagination.pageIndex * pagination.pageSize,
    search: debouncedValue,
  });
  const cappedRowCount = Math.min(totalCount, API_KEYS_MAX_ROW_COUNT);

  let content: ReactNode;
  if (isApiKeysLoading) {
    content = (
      <DataTableLoadingSkeleton showSelectionColumn={false} showTrailingCell />
    );
  } else if (isApiKeysError) {
    content = (
      <div className="text-sm text-muted-foreground">
        Failed to load API keys.
      </div>
    );
  } else if (apiKeys.length === 0) {
    content = (
      <div className="text-sm text-muted-foreground">
        {debouncedValue.trim()
          ? `No match for "${debouncedValue.trim()}".`
          : "No API key usage over this period."}
      </div>
    );
  } else {
    content = (
      <div className="overflow-x-auto">
        <ApiKeysRowsTable rows={apiKeys} totalCredits={totalCredits} />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-panel-background p-4">
      <SearchInput
        name="automations-api-keys-search"
        placeholder="Search…"
        value={inputValue}
        onChange={setValue}
        className="mb-4 w-full"
      />
      <div aria-busy={isApiKeysLoading || isApiKeysValidating}>{content}</div>
      {cappedRowCount > pagination.pageSize && (
        <div className="mt-2 p-1">
          <Pagination
            size="xs"
            showDetails={false}
            pagination={pagination}
            setPagination={setPagination}
            rowCount={cappedRowCount}
          />
        </div>
      )}
    </div>
  );
}
