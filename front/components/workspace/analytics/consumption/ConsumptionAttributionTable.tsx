import {
  AvatarNameCell,
  CostShareCell,
} from "@app/components/workspace/analytics/creditsTableCells";
import type { ConsumptionTopRow } from "@app/hooks/useConsumptionTop";
import { useConsumptionTop } from "@app/hooks/useConsumptionTop";
import { useDebounce } from "@app/hooks/useDebounce";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
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
import { ConsumptionAttributionBreakdown } from "./ConsumptionAttributionBreakdown";
import type { ConsumptionDimension } from "./consumptionDimensions";
import {
  CONSUMPTION_DIMENSION_CONFIG,
  CONSUMPTION_DIMENSIONS,
  isConsumptionDimension,
} from "./consumptionDimensions";

const TOP_LIMIT = 25;

const SEARCH_DEBOUNCE_DELAY_MS = 300;

type AttributionRowData = ConsumptionTopRow & {
  isExpanded: boolean;
  onClick: () => void;
};

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
            <ConsumptionAttributionBreakdown
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
