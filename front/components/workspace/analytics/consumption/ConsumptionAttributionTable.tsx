import type { ConsumptionDimension } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import {
  CONSUMPTION_DIMENSION_CONFIG,
  CONSUMPTION_DIMENSIONS,
  isConsumptionDimension,
} from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import type { ConsumptionPeriodSelection } from "@app/components/workspace/analytics/consumption/consumptionPeriod";
import { AvatarNameCell } from "@app/components/workspace/analytics/creditsTableCells";
import type { ConsumptionTopRow } from "@app/hooks/useConsumptionTop";
import { useConsumptionTop } from "@app/hooks/useConsumptionTop";
import { useDebounce } from "@app/hooks/useDebounce";
import { formatCredits } from "@app/lib/client/credits";
import {
  cn,
  DataTable,
  SearchInput,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

// Enough to make the per-tab search useful without paging; the table shows a
// ranking, not the full population.
const TOP_LIMIT = 25;

// DataTable requires its optional row-interaction fields on the row shape.
// No row action here yet — expandable rows and the row-to-chart drilldown come
// in later branches.
type AttributionRowData = ConsumptionTopRow & {
  onClick?: () => void;
  onDoubleClick?: () => void;
};

function CostShareCell({ share }: { share: number }) {
  const percent = Math.round(share * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.min(100, share * 100)}%` }}
        />
      </div>
      <span className="w-8 text-right text-xs text-muted-foreground tabular-nums">
        {percent}%
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
      meta: { sizeRatio: 34 },
      cell: (info) => {
        const { name, pictureUrl } = info.row.original;
        return (
          <DataTable.CellContent>
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
      meta: { sizeRatio: 22 },
      cell: (info) => (
        <DataTable.CellContent>
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
      meta: { sizeRatio: 22 },
      cell: (info) => (
        <DataTable.BasicCellContent
          label={formatCredits(info.row.original.credits)}
        />
      ),
    },
    {
      id: "avgCredits",
      accessorKey: "avgCredits",
      header: avgLabel,
      meta: { sizeRatio: 22 },
      cell: (info) => (
        <DataTable.BasicCellContent
          label={formatCredits(info.row.original.avgCredits)}
        />
      ),
    },
  ];
}

interface AttributionRowsProps {
  workspaceId: string;
  dimension: ConsumptionDimension;
  period: ConsumptionPeriodSelection;
  search: string;
}

function AttributionRows({
  workspaceId,
  dimension,
  period,
  search,
}: AttributionRowsProps) {
  const { hasAvatar, avgLabel } = CONSUMPTION_DIMENSION_CONFIG[dimension];

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

  return (
    <div className="[&_tbody_tr:last-child]:border-b-0">
      <DataTable<AttributionRowData> data={rows} columns={columns} />
    </div>
  );
}

interface ConsumptionAttributionTableProps {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  // Owned by the page: the selected tab also drives the chart's breakdown.
  dimension: ConsumptionDimension;
  onDimensionChange: (dimension: ConsumptionDimension) => void;
}

export function ConsumptionAttributionTable({
  workspaceId,
  period,
  dimension,
  onDimensionChange,
}: ConsumptionAttributionTableProps) {
  const { inputValue, debouncedValue, setValue } = useDebounce("", {
    delay: 300,
  });

  return (
    <div className={cn("rounded-lg border border-border bg-card p-4")}>
      <div className="mb-3 flex items-center justify-between gap-4">
        <h3 className="text-base font-medium text-foreground">Attribution</h3>
        <SearchInput
          name="consumption-attribution-search"
          placeholder="Search…"
          value={inputValue}
          onChange={setValue}
          className="w-64"
        />
      </div>
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
      <div className="pt-3">
        <AttributionRows
          workspaceId={workspaceId}
          dimension={dimension}
          period={period}
          search={debouncedValue}
        />
      </div>
    </div>
  );
}
