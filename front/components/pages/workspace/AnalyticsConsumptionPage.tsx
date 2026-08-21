import { CHART_HEIGHT } from "@app/components/charts/constants";
import type { ConsumptionAttributionTableProps } from "@app/components/workspace/analytics/consumption/ConsumptionAttributionTable";
import { ConsumptionAttributionTable } from "@app/components/workspace/analytics/consumption/ConsumptionAttributionTable";
import type { ConsumptionChartProps } from "@app/components/workspace/analytics/consumption/ConsumptionChart";
import type { ConsumptionOverviewProps } from "@app/components/workspace/analytics/consumption/ConsumptionOverview";
import { ConsumptionOverview } from "@app/components/workspace/analytics/consumption/ConsumptionOverview";
import { ConsumptionPeriodSelector } from "@app/components/workspace/analytics/consumption/ConsumptionPeriodSelector";
import type { ConsumptionSummaryProps } from "@app/components/workspace/analytics/consumption/ConsumptionSummary";
import { ConsumptionSummary } from "@app/components/workspace/analytics/consumption/ConsumptionSummary";
import type { ConsumptionDimension } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import {
  CONSUMPTION_DIMENSIONS,
  consumptionDimensionFromQueryParam,
  isFilterableConsumptionDimension,
} from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import type { UsageFilterPanelProps } from "@app/components/workspace/analytics/UsageFilterPanel";
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
import type { LightWorkspaceType } from "@app/types/user";
import {
  cn,
  LoadingBlock,
  Page,
  SafeSuspense,
  safeLazy,
} from "@dust-tt/sparkle";
import { domMax, LazyMotion, m, useReducedMotion } from "framer-motion";
import type { ComponentType, ReactNode } from "react";
import { useMemo, useState } from "react";

const canReload = () => !isNavigationLocked();

const LazyConsumptionChart = safeLazy(
  () =>
    import(
      "@app/components/workspace/analytics/consumption/ConsumptionChart"
    ).then((mod) => ({ default: mod.ConsumptionChart })),
  { canReload }
);

export interface AnalyticsConsumptionComponents {
  AttributionTable: ComponentType<ConsumptionAttributionTableProps>;
  Chart: ComponentType<ConsumptionChartProps>;
  Overview: ComponentType<ConsumptionOverviewProps>;
  Summary: ComponentType<ConsumptionSummaryProps>;
  UsageFilterPanel: ComponentType<UsageFilterPanelProps>;
}

const WORKSPACE_CONSUMPTION_COMPONENTS: AnalyticsConsumptionComponents = {
  AttributionTable: ConsumptionAttributionTable,
  Chart: LazyConsumptionChart,
  Overview: ConsumptionOverview,
  Summary: ConsumptionSummary,
  UsageFilterPanel,
};

interface ChartFallbackProps {
  controlsInCard?: boolean;
}

function ChartFallback({ controlsInCard = false }: ChartFallbackProps) {
  const controls = (
    <div className="rounded-2xl border border-border-dark bg-background p-1">
      <LoadingBlock className="h-8 w-36 rounded-xl" />
    </div>
  );
  const chart = (
    <div
      aria-hidden="true"
      className="rounded-lg border border-border bg-background p-4"
    >
      <div
        className={cn(
          "border-b border-border pb-3",
          controlsInCard && "flex items-center justify-between gap-4"
        )}
      >
        <LoadingBlock className="h-6 w-36" />
        {controlsInCard && controls}
      </div>
      <LoadingBlock className="mt-3 w-full" style={{ height: CHART_HEIGHT }} />
      <div className="mt-3 flex h-5 items-center gap-6">
        <LoadingBlock className="h-4 w-32" />
        <LoadingBlock className="h-4 w-36" />
      </div>
    </div>
  );

  if (controlsInCard) {
    return chart;
  }

  return (
    <div aria-hidden="true" className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <LoadingBlock className="h-5 w-28" />
        {controls}
      </div>
      {chart}
    </div>
  );
}

export function AnalyticsConsumptionPage() {
  const owner = useWorkspace();
  const { hasFeature } = useFeatureFlags();
  const isEnabled = hasFeature("enable_analytics_consumption");
  const state = useAnalyticsConsumptionState();

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

  return <AnalyticsConsumptionContent owner={owner} state={state} />;
}

interface AnalyticsConsumptionContentProps {
  components?: AnalyticsConsumptionComponents;
  dimensions?: readonly ConsumptionDimension[];
  embedded?: boolean;
  headerBadge?: ReactNode;
  owner: LightWorkspaceType;
  showExport?: boolean;
  showMemberGroupFilter?: boolean;
  showOverviewError?: boolean;
  state: AnalyticsConsumptionState;
  title?: string;
  usageHref?: string;
  usageLinkLabel?: string;
}

export function AnalyticsConsumptionContent({
  components = WORKSPACE_CONSUMPTION_COMPONENTS,
  dimensions = CONSUMPTION_DIMENSIONS,
  embedded = false,
  headerBadge,
  owner,
  showExport = true,
  showMemberGroupFilter = true,
  showOverviewError = false,
  state,
  title = "Analytics",
  usageHref = `/w/${owner.sId}/usage`,
  usageLinkLabel,
}: AnalyticsConsumptionContentProps) {
  const {
    dimension,
    filter,
    handleDimensionChange,
    period,
    scopeFilter,
    setFilter,
    setPeriod,
    shouldReduceMotion,
  } = state;
  const {
    AttributionTable: AttributionTableComponent,
    Chart: ChartComponent,
    Overview: OverviewComponent,
    Summary: SummaryComponent,
    UsageFilterPanel: UsageFilterPanelComponent,
  } = components;

  const header = embedded ? (
    <div className="flex w-full flex-col gap-4 sm:flex-row sm:justify-between">
      <div className="flex flex-row flex-wrap items-center gap-2">
        {headerBadge}
        <OverviewComponent
          workspaceId={owner.sId}
          period={period}
          showError={showOverviewError}
        />
      </div>
      <ConsumptionPeriodSelector period={period} onPeriodChange={setPeriod} />
    </div>
  ) : (
    <div className="flex w-full flex-row justify-between">
      <div className="flex flex-col gap-1">
        <Page.H variant="h3">{title}</Page.H>
        <OverviewComponent workspaceId={owner.sId} period={period} />
      </div>
      <ConsumptionPeriodSelector period={period} onPeriodChange={setPeriod} />
    </div>
  );

  return (
    <Page.Vertical align="stretch" gap="xl">
      {embedded ? header : <Page.Header title={header} />}

      <SummaryComponent
        workspaceId={owner.sId}
        period={period}
        usageHref={usageHref}
        usageLinkLabel={usageLinkLabel}
      />

      <div className="flex flex-col gap-4">
        <div
          className={cn("flex flex-col", !embedded && "bg-panel-background")}
        >
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-foreground">Explore</h2>
            <UsageFilterPanelComponent
              owner={owner}
              period={period}
              filter={filter}
              onFilterChange={setFilter}
              showMemberGroupFilter={showMemberGroupFilter}
            />
          </div>
          <UsageFilterSummary filter={filter} onFilterChange={setFilter} />
        </div>
        <LazyMotion features={domMax}>
          <m.div
            layout={!shouldReduceMotion}
            transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}
            className="flex flex-col"
          >
            <SafeSuspense
              fallback={<ChartFallback controlsInCard={embedded} />}
            >
              <ChartComponent
                workspaceId={owner.sId}
                period={period}
                dimension={dimension}
                filter={scopeFilter}
              />
            </SafeSuspense>
          </m.div>
        </LazyMotion>
      </div>

      <AttributionTableComponent
        workspaceId={owner.sId}
        period={period}
        filter={scopeFilter}
        onAddFilter={(selectedRow) => {
          if (!isFilterableConsumptionDimension(dimension)) {
            return;
          }
          setFilter((current) =>
            addUsageFilterFromAttributionRow(current, dimension, selectedRow)
          );
        }}
        onRemoveFilter={(selectedRow) => {
          if (!isFilterableConsumptionDimension(dimension)) {
            return;
          }
          setFilter((current) =>
            removeUsageFilterFromAttributionRow(current, dimension, selectedRow)
          );
        }}
        dimension={dimension}
        dimensions={dimensions}
        onDimensionChange={handleDimensionChange}
        onViewAll={(nextDimension, selectedRow) => {
          if (!isFilterableConsumptionDimension(dimension)) {
            return;
          }
          setFilter((current) =>
            setUsageFilterFromAttributionRow(current, dimension, selectedRow)
          );
          handleDimensionChange(nextDimension);
        }}
        showExport={showExport}
      />
    </Page.Vertical>
  );
}

interface UseAnalyticsConsumptionStateOptions {
  dimensions?: readonly ConsumptionDimension[];
}

export function useAnalyticsConsumptionState({
  dimensions = CONSUMPTION_DIMENSIONS,
}: UseAnalyticsConsumptionStateOptions = {}) {
  const [period, setPeriod] = useState<ConsumptionPeriodSelection>(
    DEFAULT_CONSUMPTION_PERIOD
  );
  const { dimension: dimensionParam } = useQueryParams(["dimension"]);
  const dimension = consumptionDimensionFromQueryParam(
    dimensionParam.value,
    dimensions
  );
  const [filter, setFilter] = useState<UsageFilter>({});
  const scopeFilter = useMemo(() => toConsumptionScopeFilter(filter), [filter]);
  const shouldReduceMotion = useReducedMotion();

  const handleDimensionChange = (nextDimension: ConsumptionDimension) => {
    dimensionParam.setParam(nextDimension);
  };

  return {
    dimension,
    filter,
    handleDimensionChange,
    period,
    scopeFilter,
    setFilter,
    setPeriod,
    shouldReduceMotion,
  };
}

type AnalyticsConsumptionState = ReturnType<
  typeof useAnalyticsConsumptionState
>;
