import { ConsumptionAttributionTable } from "@app/components/workspace/analytics/consumption/ConsumptionAttributionTable";
import { ConsumptionOverview } from "@app/components/workspace/analytics/consumption/ConsumptionOverview";
import { ConsumptionPeriodSelector } from "@app/components/workspace/analytics/consumption/ConsumptionPeriodSelector";
import type { ConsumptionDimension } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import { consumptionDimensionFromQueryParam } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import { UsageFilterPanel } from "@app/components/workspace/analytics/UsageFilterPanel";
import { UsageFilterSummary } from "@app/components/workspace/analytics/UsageFilterSummary";
import type { UsageFilter } from "@app/components/workspace/analytics/usageFilter";
import {
  addUsageFilterFromAttributionRow,
  removeUsageFilterFromAttributionRow,
  setUsageFilterFromAttributionRow,
  toConsumptionScopeFilter,
} from "@app/components/workspace/analytics/usageFilter";
import { useQueryParams } from "@app/hooks/useQueryParams";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { DEFAULT_CONSUMPTION_PERIOD } from "@app/lib/analytics/consumption_period";
import { useFeatureFlags, useWorkspace } from "@app/lib/auth/AuthContext";
import { isNavigationLocked } from "@app/lib/navigation-lock";
import { cn, Page, SafeSuspense, safeLazy } from "@dust-tt/sparkle";
import { domMax, LazyMotion, m, useReducedMotion } from "framer-motion";

import { useMemo, useState } from "react";

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
  const { dimension: dimensionParam } = useQueryParams(["dimension"]);
  const dimension = consumptionDimensionFromQueryParam(dimensionParam.value);
  const [filter, setFilter] = useState<UsageFilter>({});
  const scopeFilter = useMemo(() => toConsumptionScopeFilter(filter), [filter]);
  const shouldReduceMotion = useReducedMotion();

  const handleDimensionChange = (nextDimension: ConsumptionDimension) => {
    dimensionParam.setParam(nextDimension);
  };

  if (!isEnabled) {
    return (
      <Page.Vertical align="stretch" gap="xl">
        <Page.Header title={<Page.H variant="h3">Analytics</Page.H>} />
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
    <Page.Vertical align="stretch" gap="none">
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
      />
      <div className="flex flex-col gap-8 pb-8 pt-4">
        <ConsumptionOverview
          workspaceId={owner.sId}
          period={period}
          filter={scopeFilter}
        />
        <LazyMotion features={domMax}>
          <div className="flex flex-col gap-4">
            <div className="sticky top-0 z-30 -mb-4 flex flex-col bg-panel-background pb-4 pt-4">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold text-foreground">
                  Explore
                </h2>
                <UsageFilterPanel
                  owner={owner}
                  period={period}
                  filter={filter}
                  onFilterChange={setFilter}
                />
              </div>
              <UsageFilterSummary filter={filter} onFilterChange={setFilter} />
            </div>
            <m.div
              layout={!shouldReduceMotion}
              transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}
              className="flex flex-col"
            >
              <SafeSuspense fallback={<ChartFallback />}>
                <ConsumptionChart
                  workspaceId={owner.sId}
                  period={period}
                  dimension={dimension}
                  filter={scopeFilter}
                />
              </SafeSuspense>
            </m.div>
          </div>
        </LazyMotion>
        <ConsumptionAttributionTable
          workspaceId={owner.sId}
          period={period}
          filter={scopeFilter}
          onAddFilter={(selectedRow) => {
            setFilter((current) =>
              addUsageFilterFromAttributionRow(current, dimension, selectedRow)
            );
          }}
          onRemoveFilter={(selectedRow) => {
            setFilter((current) =>
              removeUsageFilterFromAttributionRow(
                current,
                dimension,
                selectedRow
              )
            );
          }}
          dimension={dimension}
          onDimensionChange={handleDimensionChange}
          onViewAll={(nextDimension, selectedRow) => {
            setFilter((current) =>
              setUsageFilterFromAttributionRow(current, dimension, selectedRow)
            );
            handleDimensionChange(nextDimension);
          }}
        />
      </div>
    </Page.Vertical>
  );
}
