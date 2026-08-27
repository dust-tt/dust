import { ObservabilityProvider } from "@app/components/agent_builder/observability/ObservabilityContext";
import { AgentFeedback } from "@app/components/observability/AgentFeedback";
import {
  ObservabilityModeSelector,
  ObservabilityPeriodSelector,
} from "@app/components/observability/SharedObservabilityFilterSelector";
import { ConsumptionAttributionTable } from "@app/components/workspace/analytics/consumption/ConsumptionAttributionTable";
import { ConsumptionChart } from "@app/components/workspace/analytics/consumption/ConsumptionChart";
import { ConsumptionOverview } from "@app/components/workspace/analytics/consumption/ConsumptionOverview";
import { ConsumptionPeriodSelector } from "@app/components/workspace/analytics/consumption/ConsumptionPeriodSelector";
import { ConsumptionSummary } from "@app/components/workspace/analytics/consumption/ConsumptionSummary";
import type { ConsumptionDimension } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import { UsageFilterPanel } from "@app/components/workspace/analytics/UsageFilterPanel";
import { UsageFilterSummary } from "@app/components/workspace/analytics/UsageFilterSummary";
import type { UsageFilter } from "@app/components/workspace/analytics/usageFilter";
import {
  addUsageFilterFromAttributionRow,
  removeUsageFilterFromAttributionRow,
  setUsageFilterFromAttributionRow,
  toConsumptionScopeFilter,
} from "@app/components/workspace/analytics/usageFilter";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { DEFAULT_CONSUMPTION_PERIOD } from "@app/lib/analytics/consumption_period";
import type { ConsumptionAnalyticsScope } from "@app/lib/analytics/consumption_scope";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { WorkspaceType } from "@app/types/user";
import { isManager } from "@app/types/user";
import {
  ContentMessage,
  Lock01,
  Page,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { domMax, LazyMotion, m, useReducedMotion } from "framer-motion";
import { useMemo, useState } from "react";

type InsightsSubTab = "analytics" | "feedback";

interface AgentInsightsTabProps {
  owner: WorkspaceType;
  agentConfiguration: AgentConfigurationType;
}

export function AgentInsightsTab({
  owner,
  agentConfiguration,
}: AgentInsightsTabProps) {
  const [selectedSubTab, setSelectedSubTab] =
    useState<InsightsSubTab>("analytics");
  const [period, setPeriod] = useState<ConsumptionPeriodSelection>(
    DEFAULT_CONSUMPTION_PERIOD
  );
  const [dimension, setDimension] = useState<ConsumptionDimension>("user");
  const [filter, setFilter] = useState<UsageFilter>({});
  const scopeFilter = useMemo(() => toConsumptionScopeFilter(filter), [filter]);
  const shouldReduceMotion = useReducedMotion();
  const agentId = agentConfiguration.sId;
  const analyticsScope: ConsumptionAnalyticsScope = {
    kind: "agent",
    agentId,
  };
  const isCustomAgent = agentConfiguration.scope !== "global";
  const canViewInsights =
    agentConfiguration.scope === "global" ||
    agentConfiguration.canEdit ||
    isManager(owner);

  if (!canViewInsights) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-foreground">Insights</h2>
        <ContentMessage
          title="You’re not an editor of this agent"
          icon={Lock01}
          size="md"
          variant="primary"
        >
          Only editors of this agent and workspace managers can view its
          analytics and feedback.
        </ContentMessage>
      </div>
    );
  }

  return (
    <ObservabilityProvider>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Insights</h2>
          {selectedSubTab === "feedback" && (
            <ObservabilityModeSelector
              workspaceId={owner.sId}
              agentConfigurationId={agentId}
              isCustomAgent={isCustomAgent}
            />
          )}
        </div>
        <Tabs
          value={selectedSubTab}
          onValueChange={(value) => {
            if (value === "analytics" || value === "feedback") {
              setSelectedSubTab(value);
            }
          }}
        >
          <div className="flex items-center justify-between gap-4">
            <TabsList border>
              <TabsTrigger value="analytics" label="Analytics" />
              <TabsTrigger value="feedback" label="Feedback" />
            </TabsList>
            {selectedSubTab === "analytics" ? (
              <ConsumptionPeriodSelector
                period={period}
                onPeriodChange={setPeriod}
              />
            ) : (
              <ObservabilityPeriodSelector
                workspaceId={owner.sId}
                agentConfigurationId={agentId}
                isCustomAgent={isCustomAgent}
                size="sm"
              />
            )}
          </div>
          <TabsContent value="analytics">
            <div className="pt-4">
              <Page.Vertical align="stretch" gap="xl">
                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-semibold text-foreground">
                    Overview
                  </h3>
                  <ConsumptionOverview
                    workspaceId={owner.sId}
                    period={period}
                    analyticsScope={analyticsScope}
                  />
                </div>

                <ConsumptionSummary
                  workspaceId={owner.sId}
                  period={period}
                  analyticsScope={analyticsScope}
                />

                <div className="flex flex-col gap-4">
                  <div className="flex flex-col">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="text-base font-semibold text-foreground">
                        Explore
                      </h3>
                      <UsageFilterPanel
                        owner={owner}
                        period={period}
                        filter={filter}
                        analyticsScope={analyticsScope}
                        onFilterChange={setFilter}
                      />
                    </div>
                    <UsageFilterSummary
                      filter={filter}
                      onFilterChange={setFilter}
                    />
                  </div>
                  <LazyMotion features={domMax}>
                    <m.div
                      layout={!shouldReduceMotion}
                      transition={{
                        duration: shouldReduceMotion ? 0 : 0.18,
                      }}
                      className="flex flex-col"
                    >
                      <ConsumptionChart
                        workspaceId={owner.sId}
                        period={period}
                        dimension={dimension}
                        filter={scopeFilter}
                        analyticsScope={analyticsScope}
                      />
                    </m.div>
                  </LazyMotion>
                </div>

                <ConsumptionAttributionTable
                  workspaceId={owner.sId}
                  period={period}
                  filter={scopeFilter}
                  analyticsScope={analyticsScope}
                  onAddFilter={(selectedRow) => {
                    setFilter((current) =>
                      addUsageFilterFromAttributionRow(
                        current,
                        dimension,
                        selectedRow
                      )
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
                  onDimensionChange={setDimension}
                  onViewAll={(nextDimension, selectedRow) => {
                    setFilter((current) =>
                      setUsageFilterFromAttributionRow(
                        current,
                        dimension,
                        selectedRow
                      )
                    );
                    setDimension(nextDimension);
                  }}
                />
              </Page.Vertical>
            </div>
          </TabsContent>
          <TabsContent value="feedback">
            <AgentFeedback
              owner={owner}
              agentConfigurationId={agentId}
              allowReactions={isCustomAgent}
            />
          </TabsContent>
        </Tabs>
      </div>
    </ObservabilityProvider>
  );
}
