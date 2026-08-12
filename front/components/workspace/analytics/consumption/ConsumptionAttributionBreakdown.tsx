import { CostShareBar } from "@app/components/workspace/analytics/creditsTableCells";
import { useConsumptionTop } from "@app/hooks/useConsumptionTop";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import { CONSUMPTION_DIMENSION_FILTER_KEYS } from "@app/lib/api/analytics/consumption/scope";
import { Button, LoadingBlock } from "@dust-tt/sparkle";
import { useState } from "react";
import type { ConsumptionDimension } from "./consumptionDimensions";

const BREAKDOWN_LIMIT = 25;
const BREAKDOWN_PREVIEW_LIMIT = 3;

const BREAKDOWN_DIMENSIONS = ["model", "tool", "user"] as const;
type BreakdownDimension = (typeof BREAKDOWN_DIMENSIONS)[number];

const BREAKDOWN_LABELS: Record<BreakdownDimension, string> = {
  model: "By model",
  tool: "By tools",
  user: "By users",
};

const SKELETON_LABEL_WIDTHS = ["w-28", "w-20", "w-24"];

function BreakdownColumnSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {SKELETON_LABEL_WIDTHS.map((width) => (
        <div key={width}>
          <div className="mb-1 flex h-4 items-center justify-between">
            <LoadingBlock className={`h-3 ${width}`} />
            <LoadingBlock className="h-3 w-7" />
          </div>
          <LoadingBlock className="h-1.5 w-full rounded-full" />
        </div>
      ))}
    </div>
  );
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
    limit: BREAKDOWN_LIMIT,
    filter,
  });
  const visibleRows = showAll ? rows : rows.slice(0, BREAKDOWN_PREVIEW_LIMIT);

  return (
    <div className="min-w-0">
      <div className="mb-2 flex h-6 items-center justify-between gap-2">
        <h4 className="text-sm font-medium text-muted-foreground">
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
        <BreakdownColumnSkeleton />
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

interface ConsumptionAttributionBreakdownProps {
  workspaceId: string;
  selectedDimension: ConsumptionDimension;
  selectedRowId: string;
  period: ConsumptionPeriodSelection;
  filter?: ConsumptionScopeFilter;
}

export function ConsumptionAttributionBreakdown({
  workspaceId,
  selectedDimension,
  selectedRowId,
  period,
  filter,
}: ConsumptionAttributionBreakdownProps) {
  const selectedFilter: ConsumptionScopeFilter = {
    ...filter,
    [CONSUMPTION_DIMENSION_FILTER_KEYS[selectedDimension]]: [selectedRowId],
  };

  return (
    <div className="grid animate-in grid-cols-3 gap-20 border-b border-separator px-2 pb-6 pt-4 fade-in-0 slide-in-from-top-1 duration-enter ease-enter motion-reduce:animate-none">
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
