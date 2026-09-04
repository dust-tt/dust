import { AgentDetailsSheet } from "@app/components/assistant/details/AgentDetailsSheet";
import { CHART_HEIGHT } from "@app/components/charts/constants";
import { SkillDetailsSheetById } from "@app/components/command_palette/SkillDetailsSheetById";
import { AdminPageContainer } from "@app/components/layouts/AdminPageContainer";
import { useDesktopNavigation } from "@app/components/navigation/DesktopNavigationContext";
import { AnalyticsConversationPanel } from "@app/components/workspace/analytics/AnalyticsConversationPanel";
import { AnalyticsExportPanel } from "@app/components/workspace/analytics/AnalyticsExportPanel";
import type { ConsumptionAttributionTableProps } from "@app/components/workspace/analytics/consumption/ConsumptionAttributionTable";
import { ConsumptionAttributionTable } from "@app/components/workspace/analytics/consumption/ConsumptionAttributionTable";
import type { ConsumptionChartProps } from "@app/components/workspace/analytics/consumption/ConsumptionChart";
import type { ConsumptionOverviewProps } from "@app/components/workspace/analytics/consumption/ConsumptionOverview";
import { ConsumptionOverview } from "@app/components/workspace/analytics/consumption/ConsumptionOverview";
import {
  ConsumptionGranularitySelector,
  ConsumptionPeriodSelector,
} from "@app/components/workspace/analytics/consumption/ConsumptionPeriodSelector";
import type { ConsumptionSummaryProps } from "@app/components/workspace/analytics/consumption/ConsumptionSummary";
import { ConsumptionSummary } from "@app/components/workspace/analytics/consumption/ConsumptionSummary";
import type { ConsumptionDimension } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import { consumptionDimensionFromQueryParam } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
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

import { useAnalyticsViewState } from "@app/hooks/useAnalyticsViewState";
import { useQueryParams } from "@app/hooks/useQueryParams";
import { useResolvedUsageFilter } from "@app/hooks/useResolvedUsageFilter";
import type {
  ConsumptionGranularity,
  ConsumptionPeriodSelection,
} from "@app/lib/analytics/consumption_period";
import {
  consumptionPeriodKey,
  DEFAULT_CONSUMPTION_GRANULARITY,
  DEFAULT_CONSUMPTION_PERIOD,
} from "@app/lib/analytics/consumption_period";
import {
  useAuth,
  useFeatureFlags,
  useWorkspace,
} from "@app/lib/auth/AuthContext";
import { isNavigationLocked } from "@app/lib/navigation-lock";
import type { TrackingExtra } from "@app/lib/tracking";
import {
  TRACKING_ACTIONS,
  TRACKING_AREAS,
  trackEvent,
} from "@app/lib/tracking";
import type { LightWorkspaceType } from "@app/types/user";
import { isWorkspaceAnalyticsEnabled } from "@app/types/user";
import {
  Button,
  cn,
  LoadingBlock,
  Page,
  ResizableSidePanel,
  Robot,
  SafeSuspense,
  safeLazy,
} from "@dust-tt/sparkle";
import { domMax, LazyMotion, m, useReducedMotion } from "framer-motion";
import type { ComponentType } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

const canReload = () => !isNavigationLocked();

const MIN_CONTENT_WIDTH_WITH_PANEL_PX = 720;

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

function trackAnalyticsClick(
  workspaceId: string | null,
  clickTarget: string,
  extra?: TrackingExtra
) {
  if (!workspaceId) {
    return;
  }

  trackEvent({
    area: TRACKING_AREAS.ANALYTICS,
    object: "analytics_page",
    action: TRACKING_ACTIONS.CLICK,
    extra: {
      ...extra,
      workspace_id: workspaceId,
      click_target: clickTarget,
    },
  });
}

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
  const { user } = useAuth();
  const [agentDetailsId, setAgentDetailsId] = useState<string | null>(null);
  const [skillDetailsId, setSkillDetailsId] = useState<string | null>(null);
  const state = useAnalyticsConsumptionState(useAnalyticsViewState());
  const filter = useResolvedUsageFilter({
    workspaceId: owner.sId,
    period: state.period,
    filter: state.filter,
  });

  const [isOpen, setIsOpen] = useState(false);

  const { hasFeature } = useFeatureFlags();
  const analyticsAssistantEnabled =
    hasFeature("analytics_conversation_panel") &&
    isWorkspaceAnalyticsEnabled(owner);

  useEffect(() => {
    trackEvent({
      area: TRACKING_AREAS.ANALYTICS,
      object: "analytics_page",
      action: TRACKING_ACTIONS.VIEW,
      extra: { workspace_id: owner.sId },
    });
  }, [owner.sId]);

  const { isNavigationBarOpen, setIsNavigationBarOpen } =
    useDesktopNavigation();
  const didFoldNavigationForPanelRef = useRef(false);

  const foldNavigationForPanel = useCallback(() => {
    if (isNavigationBarOpen) {
      didFoldNavigationForPanelRef.current = true;
      setIsNavigationBarOpen(false);
    }
  }, [isNavigationBarOpen, setIsNavigationBarOpen]);

  const closePanel = () => {
    setIsOpen(false);
    if (didFoldNavigationForPanelRef.current) {
      didFoldNavigationForPanelRef.current = false;
      setIsNavigationBarOpen(true);
    }
  };

  useEffect(() => {
    if (isNavigationBarOpen) {
      didFoldNavigationForPanelRef.current = false;
    }
  }, [isNavigationBarOpen]);

  const content = (
    <AdminPageContainer className="relative">
      {analyticsAssistantEnabled && !isOpen && (
        <Button
          variant="outline"
          icon={Robot}
          label="Ask @analyst"
          className="absolute right-4 top-4 z-10 sm:right-10 sm:top-8"
          onClick={() => setIsOpen(true)}
        />
      )}
      <AnalyticsConsumptionContent
        owner={owner}
        state={{ ...state, filter }}
        onAgentClick={setAgentDetailsId}
        onSkillClick={setSkillDetailsId}
      />
    </AdminPageContainer>
  );

  return (
    <>
      <AgentDetailsSheet
        owner={owner}
        user={user}
        agentId={agentDetailsId}
        onClose={() => setAgentDetailsId(null)}
      />
      <SkillDetailsSheetById
        owner={owner}
        user={user}
        skillId={skillDetailsId}
        onClose={() => setSkillDetailsId(null)}
      />
      {analyticsAssistantEnabled ? (
        <ResizableSidePanel
          isOpen={isOpen}
          onCollapse={closePanel}
          minContentWidthPx={MIN_CONTENT_WIDTH_WITH_PANEL_PX}
          onContentSqueezed={foldNavigationForPanel}
          className="min-h-0 flex-1"
          panel={
            <AnalyticsConversationPanel
              owner={owner}
              user={user}
              onClose={closePanel}
              disabled={!isOpen}
            />
          }
        >
          <div className="h-full w-full overflow-y-auto">{content}</div>
        </ResizableSidePanel>
      ) : (
        content
      )}
    </>
  );
}

interface AnalyticsConsumptionContentProps {
  components?: AnalyticsConsumptionComponents;
  embedded?: boolean;
  owner: LightWorkspaceType;
  onAgentClick?: (agentId: string) => void;
  onSkillClick?: (skillId: string) => void;
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
  owner,
  onAgentClick,
  onSkillClick,
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
    granularity,
    scopeFilter,
    setFilter,
    setPeriod,
    setGranularity,
    shouldReduceMotion,
  } = state;
  const {
    AttributionTable: AttributionTableComponent,
    Chart: ChartComponent,
    Overview: OverviewComponent,
    Summary: SummaryComponent,
    UsageFilterPanel: UsageFilterPanelComponent,
  } = components;
  const trackingWorkspaceId = embedded ? null : owner.sId;

  const handlePeriodChange = (nextPeriod: ConsumptionPeriodSelection) => {
    trackAnalyticsClick(trackingWorkspaceId, "period_selector", {
      period: consumptionPeriodKey(nextPeriod),
    });
    setPeriod(nextPeriod);
  };

  const handleGranularityChange = (nextGranularity: ConsumptionGranularity) => {
    trackAnalyticsClick(trackingWorkspaceId, "granularity_selector", {
      granularity: nextGranularity,
    });
    setGranularity(nextGranularity);
  };

  const handleFilterChange = (nextFilter: UsageFilter) => {
    trackAnalyticsClick(trackingWorkspaceId, "filter", {
      filter_action: "apply",
    });
    setFilter(nextFilter);
  };

  const selectors = (
    <div className="flex items-center gap-2">
      <ConsumptionPeriodSelector
        period={period}
        onPeriodChange={handlePeriodChange}
      />
      <ConsumptionGranularitySelector
        granularity={granularity}
        onGranularityChange={handleGranularityChange}
      />
    </div>
  );

  const header = embedded ? (
    <div className="flex w-full flex-col gap-4 sm:flex-row sm:justify-between">
      <div className="flex flex-row flex-wrap items-center gap-2">
        <OverviewComponent
          workspaceId={owner.sId}
          period={period}
          showError={showOverviewError}
        />
      </div>
      {selectors}
    </div>
  ) : (
    <div className="flex w-full flex-row justify-between">
      <div className="flex flex-col gap-1">
        <Page.H variant="h3">{title}</Page.H>
        <OverviewComponent workspaceId={owner.sId} period={period} />
      </div>
      {selectors}
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
              onFilterChange={handleFilterChange}
              onOpenChange={(open) => {
                if (open) {
                  trackAnalyticsClick(trackingWorkspaceId, "filter", {
                    filter_action: "open",
                  });
                }
              }}
              showMemberGroupFilter={showMemberGroupFilter}
            />
          </div>
          <UsageFilterSummary
            filter={filter}
            onFilterChange={(nextFilter) => {
              trackAnalyticsClick(trackingWorkspaceId, "filter", {
                filter_action: "clear",
              });
              setFilter(nextFilter);
            }}
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
                granularity={granularity}
                dimension={dimension}
                filter={scopeFilter}
                onModeChange={(mode) => {
                  trackAnalyticsClick(trackingWorkspaceId, "chart_mode", {
                    mode,
                  });
                }}
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
          trackAnalyticsClick(trackingWorkspaceId, "attribution_filter", {
            dimension,
            filter_action: "add",
          });
          setFilter((current) =>
            addUsageFilterFromAttributionRow(current, dimension, selectedRow)
          );
        }}
        onAgentClick={onAgentClick}
        onRemoveFilter={(selectedRow) => {
          trackAnalyticsClick(trackingWorkspaceId, "attribution_filter", {
            dimension,
            filter_action: "remove",
          });
          setFilter((current) =>
            removeUsageFilterFromAttributionRow(current, dimension, selectedRow)
          );
        }}
        onSkillClick={onSkillClick}
        dimension={dimension}
        onDimensionChange={(nextDimension) => {
          trackAnalyticsClick(trackingWorkspaceId, "attribution_tab", {
            dimension: nextDimension,
          });
          handleDimensionChange(nextDimension);
        }}
        onViewAll={(nextDimension, selectedRow) => {
          trackAnalyticsClick(trackingWorkspaceId, "attribution_view_all", {
            dimension: nextDimension,
          });
          setFilter((current) =>
            setUsageFilterFromAttributionRow(current, dimension, selectedRow)
          );
          handleDimensionChange(nextDimension);
        }}
        showExport={showExport}
      />

      {showExport && <AnalyticsExportPanel workspaceId={owner.sId} />}
    </Page.Vertical>
  );
}

export function useAnalyticsConsumptionState(
  urlState?: ReturnType<typeof useAnalyticsViewState>
) {
  const [period, setPeriod] = useState<ConsumptionPeriodSelection>(
    DEFAULT_CONSUMPTION_PERIOD
  );
  const [granularity, setGranularity] = useState<ConsumptionGranularity>(
    DEFAULT_CONSUMPTION_GRANULARITY
  );
  const { dimension: dimensionParam } = useQueryParams(["dimension"]);
  const dimension = consumptionDimensionFromQueryParam(dimensionParam.value);
  const [filter, setFilter] = useState<UsageFilter>({});
  const activePeriod = urlState?.period ?? period;
  const activeGranularity = urlState?.granularity ?? granularity;
  const activeDimension = urlState?.dimension ?? dimension;
  const activeFilter = urlState?.filter ?? filter;
  const scopeFilter = toConsumptionScopeFilter(activeFilter);
  const shouldReduceMotion = useReducedMotion();

  const handleDimensionChange = (nextDimension: ConsumptionDimension) => {
    dimensionParam.setParam(nextDimension);
  };

  return {
    dimension: activeDimension,
    filter: activeFilter,
    granularity: activeGranularity,
    handleDimensionChange: urlState?.setDimension ?? handleDimensionChange,
    period: activePeriod,
    scopeFilter,
    setFilter: urlState?.setFilter ?? setFilter,
    setGranularity: urlState?.setGranularity ?? setGranularity,
    setPeriod: urlState?.setPeriod ?? setPeriod,
    shouldReduceMotion,
  };
}

type AnalyticsConsumptionState = ReturnType<
  typeof useAnalyticsConsumptionState
>;
