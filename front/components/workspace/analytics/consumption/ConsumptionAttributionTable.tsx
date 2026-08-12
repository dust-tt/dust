import { AvatarNameCell } from "@app/components/workspace/analytics/creditsTableCells";
import type { ConsumptionTopRow } from "@app/hooks/useConsumptionTop";
import { useConsumptionTop } from "@app/hooks/useConsumptionTop";
import { useDebounce } from "@app/hooks/useDebounce";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import { CONSUMPTION_DIMENSION_FILTER_KEYS } from "@app/lib/api/analytics/consumption/scope";
import { formatCredits } from "@app/lib/client/credits";
import {
  Button,
  ChevronDown,
  ChevronRight,
  cn,
  DataTable,
  SearchInput,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import type { ConsumptionDimension } from "./consumptionDimensions";
import {
  CONSUMPTION_DIMENSION_CONFIG,
  CONSUMPTION_DIMENSIONS,
  isConsumptionDimension,
} from "./consumptionDimensions";

const TOP_LIMIT = 25;

const BREAKDOWN_PREVIEW_LIMIT = 3;

const SEARCH_DEBOUNCE_DELAY_MS = 300;

const BREAKDOWN_DIMENSIONS = ["model", "tool", "user"] as const;

type BreakdownDimension = (typeof BREAKDOWN_DIMENSIONS)[number];

const BREAKDOWN_LABELS: Record<BreakdownDimension, string> = {
  model: "By model",
  tool: "By tools",
  user: "By members",
};

type AttributionRowData = ConsumptionTopRow & {
  isExpanded: boolean;
  onClick: () => void;
};

function CostShareBar({
  percentage,
  className,
}: {
  percentage: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={cn("h-1.5", className)}
      preserveAspectRatio="none"
      viewBox="0 0 100 6"
    >
      <rect className="fill-muted" height="6" rx="3" width="100" />
      <rect className="fill-primary" height="6" rx="3" width={percentage} />
    </svg>
  );
}

function CostShareCell({ share }: { share: number }) {
  const percentage = Math.round(Math.min(100, share * 100));
  return (
    <div className="flex items-center gap-2">
      <CostShareBar className="w-24" percentage={percentage} />
      <span className="w-8 text-right text-xs text-muted-foreground tabular-nums">
        {percentage}%
      </span>
    </div>
  );
}

function buildColumns({
  hasAvatar,
  avgLabel,
  totalCredits,
}: {
  hasAvatar: boolean;
  avgLabel: string;
  totalCredits: number;
}): ColumnDef<AttributionRowData>[] {
  return [
    {
      id: "name",
      accessorKey: "name",
      header: "Name",
      meta: { sizeRatio: 32, headerAlign: "left" },
      cell: (info) => {
        const { name, pictureUrl } = info.row.original;
        return (
          <DataTable.CellContent className="w-full justify-start text-left">
            {hasAvatar ? (
              <AvatarNameCell name={name} imageUrl={pictureUrl} />
            ) : (
              <span className="truncate text-sm">{name}</span>
            )}
          </DataTable.CellContent>
        );
      },
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
      id: "credits",
      accessorKey: "credits",
      header: "Total credits",
      meta: { sizeRatio: 20, headerAlign: "right" },
      cell: (info) => (
        <DataTable.BasicCellContent
          className="justify-end text-right tabular-nums"
          label={formatCredits(info.row.original.credits)}
        />
      ),
    },
    {
      id: "avgCredits",
      accessorKey: "avgCredits",
      header: avgLabel,
      meta: { sizeRatio: 22, headerAlign: "right" },
      cell: (info) => (
        <DataTable.BasicCellContent
          className="justify-end text-right tabular-nums"
          label={formatCredits(info.row.original.avgCredits)}
        />
      ),
    },
    {
      id: "details",
      header: "",
      enableSorting: false,
      meta: { sizeRatio: 6, headerAlign: "right" },
      cell: (info) => {
        const row = info.row.original;
        return (
          <DataTable.CellContent className="w-full justify-end">
            <Button
              icon={row.isExpanded ? ChevronDown : ChevronRight}
              variant="ghost-secondary"
              size="xs"
              aria-label={`${row.isExpanded ? "Collapse" : "Expand"} breakdown for ${row.name}`}
              aria-expanded={row.isExpanded}
              onClick={(event) => {
                event.stopPropagation();
                row.onClick();
              }}
            />
          </DataTable.CellContent>
        );
      },
    },
  ];
}

interface BreakdownColumnProps {
  workspaceId: string;
  dimension: BreakdownDimension;
  period: ConsumptionPeriodSelection;
  filter: ConsumptionScopeFilter;
}

function BreakdownColumn({
  workspaceId,
  dimension,
  period,
  filter,
}: BreakdownColumnProps) {
  const [showAll, setShowAll] = useState(false);
  const { rows, totalCredits, isTopLoading, isTopError } = useConsumptionTop({
    workspaceId,
    dimension,
    period,
    limit: TOP_LIMIT,
    filter,
  });
  const visibleRows = showAll ? rows : rows.slice(0, BREAKDOWN_PREVIEW_LIMIT);

  return (
    <div className="min-w-0">
      <div className="mb-2 flex h-6 items-center justify-between gap-2">
        <h4 className="text-sm font-medium text-foreground">
          {BREAKDOWN_LABELS[dimension]}
        </h4>
        {rows.length > BREAKDOWN_PREVIEW_LIMIT && (
          <Button
            label={showAll ? "Show less" : "View all"}
            variant="highlight-ghost"
            size="xs"
            onClick={() => setShowAll((current) => !current)}
          />
        )}
      </div>
      {isTopLoading ? (
        <div className="flex h-24 items-center justify-center">
          <Spinner size="sm" />
        </div>
      ) : isTopError ? (
        <div className="flex h-24 items-center text-xs text-muted-foreground">
          Failed to load breakdown.
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="flex h-24 items-center text-xs text-muted-foreground">
          No attributed consumption.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visibleRows.map((row) => {
            const share = totalCredits > 0 ? row.credits / totalCredits : 0;
            const percentage = Math.round(Math.min(100, share * 100));
            return (
              <div key={row.id} className="min-w-0">
                <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-muted-foreground">
                    {row.name}
                  </span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {percentage}%
                  </span>
                </div>
                <CostShareBar className="w-full" percentage={percentage} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface AttributionBreakdownProps {
  workspaceId: string;
  selectedDimension: ConsumptionDimension;
  selectedRowId: string;
  period: ConsumptionPeriodSelection;
  filter?: ConsumptionScopeFilter;
}

function AttributionBreakdown({
  workspaceId,
  selectedDimension,
  selectedRowId,
  period,
  filter,
}: AttributionBreakdownProps) {
  const selectedFilter: ConsumptionScopeFilter = {
    ...filter,
    [CONSUMPTION_DIMENSION_FILTER_KEYS[selectedDimension]]: [selectedRowId],
  };

  return (
    <div className="grid grid-cols-3 gap-8 border-b border-separator px-2 py-4">
      {BREAKDOWN_DIMENSIONS.map((dimension) => (
        <BreakdownColumn
          key={dimension}
          workspaceId={workspaceId}
          dimension={dimension}
          period={period}
          filter={selectedFilter}
        />
      ))}
    </div>
  );
}

interface AttributionRowsProps {
  workspaceId: string;
  dimension: ConsumptionDimension;
  period: ConsumptionPeriodSelection;
  filter?: ConsumptionScopeFilter;
  search: string;
}

function AttributionRows({
  workspaceId,
  dimension,
  period,
  filter,
  search,
}: AttributionRowsProps) {
  const { hasAvatar, avgLabel } = CONSUMPTION_DIMENSION_CONFIG[dimension];
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const {
    rows: allRows,
    totalCredits,
    isTopLoading,
    isTopError,
  } = useConsumptionTop({
    workspaceId,
    dimension,
    period,
    limit: TOP_LIMIT,
    filter,
  });

  // Client-side filter over the loaded ranking. A row outside the top
  // TOP_LIMIT will not appear — the endpoint has no server-side search yet.
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle
      ? allRows.filter((row) => row.name.toLowerCase().includes(needle))
      : allRows;
  }, [allRows, search]);

  const columns = useMemo(
    () => buildColumns({ hasAvatar, avgLabel, totalCredits }),
    [hasAvatar, avgLabel, totalCredits]
  );

  if (isTopLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }
  if (isTopError) {
    return (
      <div className="text-sm text-muted-foreground">
        Failed to load attribution.
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        {search.trim()
          ? `No match for "${search.trim()}".`
          : "No consumption over this period."}
      </div>
    );
  }

  const data: AttributionRowData[] = rows.map((row) => ({
    ...row,
    isExpanded: expandedRowId === row.id,
    onClick: () =>
      setExpandedRowId((current) => (current === row.id ? null : row.id)),
  }));

  return (
    <div className="overflow-x-auto">
      <DataTable<AttributionRowData>
        data={data}
        columns={columns}
        widthClassName="min-w-[800px]"
        renderSubComponent={(row) =>
          row.isExpanded ? (
            <AttributionBreakdown
              workspaceId={workspaceId}
              selectedDimension={dimension}
              selectedRowId={row.id}
              period={period}
              filter={filter}
            />
          ) : null
        }
      />
    </div>
  );
}

interface ConsumptionAttributionTableProps {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  filter?: ConsumptionScopeFilter;
  // Owned by the page: the selected tab also drives the chart's breakdown.
  dimension: ConsumptionDimension;
  onDimensionChange: (dimension: ConsumptionDimension) => void;
}

export function ConsumptionAttributionTable({
  workspaceId,
  period,
  filter,
  dimension,
  onDimensionChange,
}: ConsumptionAttributionTableProps) {
  const { inputValue, debouncedValue, setValue } = useDebounce("", {
    delay: SEARCH_DEBOUNCE_DELAY_MS,
  });

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <Tabs
        value={dimension}
        onValueChange={(value) => {
          if (isConsumptionDimension(value)) {
            onDimensionChange(value);
          }
        }}
      >
        <TabsList border>
          {CONSUMPTION_DIMENSIONS.map((tabDimension) => (
            <TabsTrigger
              key={tabDimension}
              value={tabDimension}
              label={CONSUMPTION_DIMENSION_CONFIG[tabDimension].label}
            />
          ))}
        </TabsList>
      </Tabs>
      <SearchInput
        name="consumption-attribution-search"
        placeholder="Search…"
        value={inputValue}
        onChange={setValue}
        className="mt-3 w-full"
      />
      <div className="pt-3">
        <AttributionRows
          workspaceId={workspaceId}
          dimension={dimension}
          period={period}
          filter={filter}
          search={debouncedValue}
        />
      </div>
    </div>
  );
}
