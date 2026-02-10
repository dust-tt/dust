import {
  Button,
  CardGrid,
  ContentMessage,
  LoadingBlock,
  Spinner,
  ValueCard,
} from "@dust-tt/sparkle";
import { lazy, Suspense } from "react";

import { useObservabilityContext } from "@app/components/agent_builder/observability/ObservabilityContext";
import { TabContentChildSectionLayout } from "@app/components/agent_builder/observability/TabContentChildSectionLayout";
import {
  useAgentAnalytics,
  useAgentObservabilitySummary,
} from "@app/lib/swr/assistants";
import type { LightWorkspaceType } from "@app/types";

// Dynamic imports for chart components to exclude recharts from server bundle

const DatasourceRetrievalTreemapChart = lazy(() =>
  import(
    "@app/components/agent_builder/observability/charts/DatasourceRetrievalTreemapChart"
  ).then((mod) => ({
    default: mod.DatasourceRetrievalTreemapChart,
  }))
);
const LatencyChart = lazy(() =>
  import(
    "@app/components/agent_builder/observability/charts/LatencyChart"
  ).then((mod) => ({
    default: mod.LatencyChart,
  }))
);
const SourceChart = lazy(() =>
  import("@app/components/agent_builder/observability/charts/SourceChart").then(
    (mod) => ({
      default: mod.SourceChart,
    })
  )
);
const ToolUsageChart = lazy(() =>
  import(
    "@app/components/agent_builder/observability/charts/ToolUsageChart"
  ).then((mod) => ({
    default: mod.ToolUsageChart,
  }))
);
const ToolExecutionTimeChart = lazy(() =>
  import(
    "@app/components/agent_builder/observability/charts/ToolExecutionTimeChart"
  ).then((mod) => ({
    default: mod.ToolExecutionTimeChart,
  }))
);
const UsageMetricsChart = lazy(() =>
  import(
    "@app/components/agent_builder/observability/charts/UsageMetricsChart"
  ).then((mod) => ({
    default: mod.UsageMetricsChart,
  }))
);

function ChartFallback() {
  return (
    <div className="h-64 animate-pulse rounded-lg bg-muted-background dark:bg-muted-background-night" />
  );
}

interface AgentObservabilityProps {
  owner: LightWorkspaceType;
  agentConfigurationId: string;
  isCustomAgent: boolean;
}

export function AgentObservability({
  owner,
  agentConfigurationId,
  isCustomAgent,
}: AgentObservabilityProps) {
  const { period, mode, selectedVersion } = useObservabilityContext();

  const isTimeRangeMode = mode === "timeRange";

  const { agentAnalytics, isAgentAnalyticsLoading } = useAgentAnalytics({
    workspaceId: owner.sId,
    agentConfigurationId,
    period,
    version:
      isCustomAgent && mode === "version"
        ? selectedVersion?.version
        : undefined,
  });

  const shouldShowMessagesPerActiveUser =
    agentAnalytics?.mentions &&
    agentAnalytics.activeUsers > 0 &&
    agentAnalytics.mentions.messageCount > 0;

  const { summaryText, isSummaryLoading, isSummaryError, refetchSummary } =
    useAgentObservabilitySummary({
      workspaceId: owner.sId,
      agentConfigurationId,
      days: period,
      disabled: !isTimeRangeMode,
    });

  return (
    <div className="flex flex-col gap-6 pt-4">
      <TabContentChildSectionLayout title="Overview">
        {isTimeRangeMode && (
          <div className="mb-4">
            {isSummaryLoading ? (
              <div className="bg-card rounded-lg border border-border p-4 dark:border-border-night">
                <div className="mb-2 flex items-center justify-between">
                  <LoadingBlock className="h-5 w-24" />
                </div>
                <div className="space-y-2">
                  <LoadingBlock className="h-4 w-full" />
                  <LoadingBlock className="h-4 w-11/12" />
                  <LoadingBlock className="h-4 w-10/12" />
                </div>
              </div>
            ) : (
              <ContentMessage
                title="Summary"
                variant="primary"
                size="lg"
                className="w-full"
              >
                {isSummaryError ? (
                  <div className="flex flex-col gap-2">
                    <span>
                      We couldn&apos;t generate a summary for this time range.
                    </span>
                    <div>
                      <Button
                        label="Try again"
                        size="xs"
                        variant="outline"
                        onClick={() => {
                          void refetchSummary();
                        }}
                      />
                    </div>
                  </div>
                ) : summaryText ? (
                  <p>{summaryText}</p>
                ) : (
                  <p>
                    There is not enough activity in this time range to generate
                    a summary yet.
                  </p>
                )}
              </ContentMessage>
            )}
          </div>
        )}

        {isAgentAnalyticsLoading ? (
          <div className="w-full p-6">
            <Spinner />
          </div>
        ) : (
          <CardGrid>
            <ValueCard
              title="Active Users"
              className="h-24"
              content={
                <div className="flex flex-col gap-1 text-2xl">
                  {agentAnalytics?.activeUsers !== undefined ? (
                    <div className="truncate text-foreground dark:text-foreground-night">
                      {agentAnalytics.activeUsers}
                    </div>
                  ) : (
                    "-"
                  )}
                </div>
              }
            />
            <ValueCard
              title="Messages / active user"
              className="h-24"
              content={
                <div className="flex flex-row gap-2 text-2xl">
                  {shouldShowMessagesPerActiveUser
                    ? `${Math.round(
                        agentAnalytics.mentions.messageCount /
                          agentAnalytics.activeUsers
                      )}`
                    : 0}
                </div>
              }
            />
          </CardGrid>
        )}
      </TabContentChildSectionLayout>

      <TabContentChildSectionLayout title="Details">
        <Suspense fallback={<ChartFallback />}>
          <UsageMetricsChart
            workspaceId={owner.sId}
            agentConfigurationId={agentConfigurationId}
            isCustomAgent={isCustomAgent}
          />
        </Suspense>
        <Suspense fallback={<ChartFallback />}>
          <SourceChart
            workspaceId={owner.sId}
            agentConfigurationId={agentConfigurationId}
            isCustomAgent={isCustomAgent}
          />
        </Suspense>
        <Suspense fallback={<ChartFallback />}>
          <LatencyChart
            workspaceId={owner.sId}
            agentConfigurationId={agentConfigurationId}
            isCustomAgent={isCustomAgent}
          />
        </Suspense>
        <Suspense fallback={<ChartFallback />}>
          <DatasourceRetrievalTreemapChart
            workspaceId={owner.sId}
            agentConfigurationId={agentConfigurationId}
            isCustomAgent={isCustomAgent}
          />
        </Suspense>
        <Suspense fallback={<ChartFallback />}>
          <ToolUsageChart
            workspaceId={owner.sId}
            agentConfigurationId={agentConfigurationId}
            isCustomAgent={isCustomAgent}
          />
        </Suspense>
        <Suspense fallback={<ChartFallback />}>
          <ToolExecutionTimeChart
            workspaceId={owner.sId}
            agentConfigurationId={agentConfigurationId}
            isCustomAgent={isCustomAgent}
          />
        </Suspense>
      </TabContentChildSectionLayout>
    </div>
  );
}
