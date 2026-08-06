import { ConsumptionAttributionTable } from "@app/components/workspace/analytics/consumption/ConsumptionAttributionTable";
import { ConsumptionOverview } from "@app/components/workspace/analytics/consumption/ConsumptionOverview";
import { ConsumptionPeriodSelector } from "@app/components/workspace/analytics/consumption/ConsumptionPeriodSelector";
import type { ConsumptionDimension } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import { DEFAULT_CONSUMPTION_DIMENSION } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import type { ConsumptionPeriodSelection } from "@app/components/workspace/analytics/consumption/consumptionPeriod";
import { DEFAULT_CONSUMPTION_PERIOD } from "@app/components/workspace/analytics/consumption/consumptionPeriod";
import { UsageFilterPanel } from "@app/components/workspace/analytics/UsageFilterPanel";
import type { UsageFilter } from "@app/components/workspace/analytics/usageFilter";
import {
  USAGE_FILTER_MOCK_ENTITIES,
  USAGE_FILTER_MOCK_GROUPS,
} from "@app/components/workspace/analytics/usageFilterMockData";
import { useFeatureFlags, useWorkspace } from "@app/lib/auth/AuthContext";
import { isNavigationLocked } from "@app/lib/navigation-lock";
import { BarChart01, cn, Page, SafeSuspense, safeLazy } from "@dust-tt/sparkle";
import { useState } from "react";

const canReload = () => !isNavigationLocked();

const ConsumptionChart = safeLazy(
  () =>
    import(
      "@app/components/workspace/analytics/consumption/ConsumptionChart"
    ).then((mod) => ({ default: mod.ConsumptionChart })),
  { canReload }
);

function ChartFallback() {
  return <div className="h-64 animate-pulse rounded-lg bg-muted-background" />;
}

export function AnalyticsConsumptionPage() {
  const owner = useWorkspace();
  const { hasFeature } = useFeatureFlags();
  const isEnabled = hasFeature("enable_analytics_consumption");
  const [period, setPeriod] = useState<ConsumptionPeriodSelection>(
    DEFAULT_CONSUMPTION_PERIOD
  );
  // Shared by the chart and the attribution table.
  // Changing attribution table dimension switches the chart's dimension too.
  const [dimension, setDimension] = useState<ConsumptionDimension>(
    DEFAULT_CONSUMPTION_DIMENSION
  );
  const [filter, setFilter] = useState<UsageFilter>({});

  if (!isEnabled) {
    return (
      <Page.Vertical align="stretch" gap="xl">
        <Page.Header
          title={<Page.H variant="h3">Analytics</Page.H>}
          icon={BarChart01}
        />
        <div
          className={cn(
            "flex flex-col gap-2 rounded-xl border p-6",
            "border-border bg-muted"
          )}
        >
          <p className="text-sm text-muted-foreground">
            This page is not enabled for this workspace.
          </p>
        </div>
      </Page.Vertical>
    );
  }

  return (
    <Page.Vertical align="stretch" gap="xl">
      <Page.Header
        title={
          <div className="flex w-full flex-row justify-between">
            <Page.H variant="h3">Analytics</Page.H>
            <ConsumptionPeriodSelector
              period={period}
              onPeriodChange={setPeriod}
            />
          </div>
        }
        icon={BarChart01}
      />
      <div className="flex flex-col gap-8 pb-8">
        <ConsumptionOverview workspaceId={owner.sId} period={period} />
        <div className="flex flex-col gap-2">
          <div className="flex justify-end">
            <UsageFilterPanel
              owner={owner}
              categoryEntities={USAGE_FILTER_MOCK_ENTITIES}
              groups={USAGE_FILTER_MOCK_GROUPS}
              filter={filter}
              onFilterChange={setFilter}
            />
          </div>
          <SafeSuspense fallback={<ChartFallback />}>
            <ConsumptionChart
              workspaceId={owner.sId}
              period={period}
              dimension={dimension}
            />
          </SafeSuspense>
        </div>
        <ConsumptionAttributionTable
          workspaceId={owner.sId}
          period={period}
          dimension={dimension}
          onDimensionChange={setDimension}
        />
      </div>
    </Page.Vertical>
  );
}
