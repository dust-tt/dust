import { CostShareBar } from "@app/components/workspace/analytics/creditsTableCells";
import type { ConsumptionTopRow } from "@app/hooks/useConsumptionTop";
import { useConsumptionTop } from "@app/hooks/useConsumptionTop";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import { CONSUMPTION_DIMENSION_FILTER_KEYS } from "@app/lib/api/analytics/consumption/scope";
import { Button, cn, LoadingBlock } from "@dust-tt/sparkle";
import type { ConsumptionDimension } from "./consumptionDimensions";
import { CONSUMPTION_DIMENSION_CONFIG } from "./consumptionDimensions";

const BREAKDOWN_LIMIT = 3;

const BREAKDOWN_DIMENSIONS = ["model", "tool", "user"] as const;
type BreakdownDimension = (typeof BREAKDOWN_DIMENSIONS)[number];

const BREAKDOWN_LABELS: Record<BreakdownDimension, string> = {
  model: "By model",
  tool: "By tools",
  user: "By users",
};

function BreakdownColumnSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className="mb-1 flex h-4 items-center justify-between">
          <LoadingBlock className="h-3 w-28" />
          <LoadingBlock className="h-3 w-7" />
        </div>
        <LoadingBlock className="h-1.5 w-full rounded-full" />
      </div>
      <div>
        <div className="mb-1 flex h-4 items-center justify-between">
          <LoadingBlock className="h-3 w-20" />
          <LoadingBlock className="h-3 w-7" />
        </div>
        <LoadingBlock className="h-1.5 w-full rounded-full" />
      </div>
      <div>
        <div className="mb-1 flex h-4 items-center justify-between">
          <LoadingBlock className="h-3 w-24" />
          <LoadingBlock className="h-3 w-7" />
        </div>
        <LoadingBlock className="h-1.5 w-full rounded-full" />
      </div>
    </div>
  );
}

interface BreakdownColumnProps {
  workspaceId: string;
  dimension: BreakdownDimension;
  period: ConsumptionPeriodSelection;
  filter: ConsumptionScopeFilter;
  selectedRowName: string;
  onViewAll: () => void;
}

function BreakdownColumn({
  workspaceId,
  dimension,
  period,
  filter,
  selectedRowName,
  onViewAll,
}: BreakdownColumnProps) {
  const { rows, totalCredits, isTopLoading, isTopError } = useConsumptionTop({
    workspaceId,
    dimension,
    period,
    limit: BREAKDOWN_LIMIT,
    filter,
  });

  return (
    <div className="min-w-0">
      <div className="mb-2 flex h-6 items-center justify-between gap-2">
        <h4 className="text-sm font-medium text-muted-foreground">
          {BREAKDOWN_LABELS[dimension]}
        </h4>
        <Button
          label="View all"
          variant="highlight-ghost"
          size="xs"
          aria-label={`View all ${CONSUMPTION_DIMENSION_CONFIG[dimension].label.toLowerCase()} for ${selectedRowName}`}
          onClick={onViewAll}
        />
      </div>
      {isTopLoading ? (
        <BreakdownColumnSkeleton />
      ) : isTopError ? (
        <div className="flex h-24 items-center text-xs text-muted-foreground">
          Failed to load breakdown.
        </div>
      ) : rows.length === 0 ? (
        <div className="flex h-24 items-center text-xs text-muted-foreground">
          No attributed consumption.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => {
            const share = totalCredits > 0 ? row.credits / totalCredits : 0;
            const percentage = Math.round(Math.min(100, share * 100));

            return (
              <div key={row.id} className="min-w-0">
                <div className="mb-1 flex h-4 items-center justify-between gap-2 text-xs">
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

interface ConsumptionAttributionBreakdownProps {
  workspaceId: string;
  selectedDimension: ConsumptionDimension;
  selectedRow: ConsumptionTopRow;
  period: ConsumptionPeriodSelection;
  filter?: ConsumptionScopeFilter;
  onViewAll: (
    dimension: ConsumptionDimension,
    selectedRow: ConsumptionTopRow
  ) => void;
}

export function ConsumptionAttributionBreakdown({
  workspaceId,
  selectedDimension,
  selectedRow,
  period,
  filter,
  onViewAll,
}: ConsumptionAttributionBreakdownProps) {
  const selectedFilter: ConsumptionScopeFilter = {
    ...filter,
    [CONSUMPTION_DIMENSION_FILTER_KEYS[selectedDimension]]: [selectedRow.id],
  };
  const visibleDimensions = BREAKDOWN_DIMENSIONS.filter(
    (dimension) => dimension !== selectedDimension
  );

  return (
    <div
      className={cn(
        "grid gap-20",
        visibleDimensions.length === 2 ? "grid-cols-2" : "grid-cols-3",
        "border-b border-separator px-2 pb-6 pt-4"
      )}
    >
      {visibleDimensions.map((dimension) => (
        <BreakdownColumn
          key={dimension}
          workspaceId={workspaceId}
          dimension={dimension}
          period={period}
          filter={selectedFilter}
          selectedRowName={selectedRow.name}
          onViewAll={() => onViewAll(dimension, selectedRow)}
        />
      ))}
    </div>
  );
}
