import { CHART_HEIGHT } from "@app/components/charts/constants";
import type { ConsumptionAttributionTableProps } from "@app/components/workspace/analytics/consumption/ConsumptionAttributionTable";
import { ConsumptionAttributionTable } from "@app/components/workspace/analytics/consumption/ConsumptionAttributionTable";
import type { ConsumptionChartProps } from "@app/components/workspace/analytics/consumption/ConsumptionChart";
import type { ConsumptionOverviewProps } from "@app/components/workspace/analytics/consumption/ConsumptionOverview";
import { ConsumptionOverview } from "@app/components/workspace/analytics/consumption/ConsumptionOverview";
import { ConsumptionPeriodSelector } from "@app/components/workspace/analytics/consumption/ConsumptionPeriodSelector";
import type { ConsumptionSummaryProps } from "@app/components/workspace/analytics/consumption/ConsumptionSummary";
import { ConsumptionSummary } from "@app/components/workspace/analytics/consumption/ConsumptionSummary";
import type { UsageFilterPanelProps } from "@app/components/workspace/analytics/UsageFilterPanel";
import { UsageFilterPanel } from "@app/components/workspace/analytics/UsageFilterPanel";
import { UsageFilterSummary } from "@app/components/workspace/analytics/UsageFilterSummary";
import type { UsageFilterOptionIndex } from "@app/components/workspace/analytics/usageFilter";
import {
  addUsageFilterDimensionId,
  indexUsageFilterOptions,
  pruneUsageFilter,
  removeUsageFilterDimensionId,
  setUsageFilterDimensionId,
  toConsumptionScopeFilter,
  usageFilterSelectionCount,
} from "@app/components/workspace/analytics/usageFilter";
import { useAnalyticsViewState } from "@app/hooks/useAnalyticsViewState";
import type { ConsumptionFacetOptions } from "@app/hooks/useConsumptionFacets";
import { useConsumptionFacets } from "@app/hooks/useConsumptionFacets";
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
import { useEffect, useMemo } from "react";

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
  // Selected ids carry no names, so the chips resolve them against the same
  // facets the panel reads. Each host wires its own facets endpoint.
  const { options: categoryOptions, isFacetsSettled } = useConsumptionFacets({
    workspaceId: owner.sId,
    period: state.period,
    filter: state.scopeFilter,
    disabled: !isEnabled || !state.hasSelection,
  });
  const optionIndex = useAnalyticsConsumptionOptionIndex({
    categoryOptions,
    isFacetsSettled,
    state,
  });

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
    <AnalyticsConsumptionContent
      optionIndex={optionIndex}
      owner={owner}
      state={state}
    />
  );
}

interface AnalyticsConsumptionContentProps {
  components?: AnalyticsConsumptionComponents;
  embedded?: boolean;
  headerBadge?: ReactNode;
  optionIndex: UsageFilterOptionIndex;
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
  embedded = false,
  headerBadge,
  optionIndex,
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
    period,
    scopeFilter,
    setDimension,
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
          <UsageFilterSummary
            filter={filter}
            optionIndex={optionIndex}
            onFilterChange={setFilter}
          />
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
          setFilter((current) =>
            addUsageFilterDimensionId(current, dimension, selectedRow.id)
          );
        }}
        onRemoveFilter={(selectedRow) => {
          setFilter((current) =>
            removeUsageFilterDimensionId(current, dimension, selectedRow.id)
          );
        }}
        dimension={dimension}
        onDimensionChange={setDimension}
        onViewAll={(nextDimension, selectedRow) => {
          setFilter((current) =>
            setUsageFilterDimensionId(current, dimension, selectedRow.id)
          );
          setDimension(nextDimension);
        }}
        showExport={showExport}
      />
    </Page.Vertical>
  );
}

export function useAnalyticsConsumptionState() {
  const { period, dimension, filter, setPeriod, setDimension, setFilter } =
    useAnalyticsViewState();
  const scopeFilter = useMemo(() => toConsumptionScopeFilter(filter), [filter]);
  const shouldReduceMotion = useReducedMotion();

  return {
    dimension,
    filter,
    hasSelection: usageFilterSelectionCount(filter) > 0,
    period,
    scopeFilter,
    setDimension,
    setFilter,
    setPeriod,
    shouldReduceMotion,
  };
}

type AnalyticsConsumptionState = ReturnType<
  typeof useAnalyticsConsumptionState
>;

// A filter id the facets no longer resolve is a deleted entity with no traffic
// in the period: it is dropped from the state and from the URL.
export function useAnalyticsConsumptionOptionIndex({
  categoryOptions,
  isFacetsSettled,
  state,
}: {
  categoryOptions: ConsumptionFacetOptions;
  isFacetsSettled: boolean;
  state: AnalyticsConsumptionState;
}): UsageFilterOptionIndex {
  const { filter, setFilter } = state;
  const optionIndex = useMemo(
    () => indexUsageFilterOptions(categoryOptions),
    [categoryOptions]
  );

  useEffect(() => {
    if (!isFacetsSettled) {
      return;
    }
    const pruned = pruneUsageFilter(filter, optionIndex);
    if (pruned) {
      setFilter(pruned);
    }
  }, [filter, isFacetsSettled, optionIndex, setFilter]);

  return optionIndex;
}
