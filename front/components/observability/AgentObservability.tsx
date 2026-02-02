import {
  Button,
  CardGrid,
  ContentMessage,
  HandThumbDownIcon,
  HandThumbUpIcon,
  LoadingBlock,
  Spinner,
  ValueCard,
} from "@dust-tt/sparkle";
import { lazy, Suspense } from "react";

import { useObservabilityContext } from "@app/components/agent_builder/observability/ObservabilityContext";
import { TabContentChildSectionLayout } from "@app/components/agent_builder/observability/TabContentChildSectionLayout";
import { TabContentLayout } from "@app/components/agent_builder/observability/TabContentLayout";
import { SharedObservabilityFilterSelector } from "@app/components/observability/SharedObservabilityFilterSelector";
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
  hideHeader?: boolean;
}

export function AgentObservability({
  owner,
  agentConfigurationId,
  isCustomAgent,
  hideHeader = false,
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

  const content = (
    <>
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
            <ValueCard
              title="Reactions"
              className="h-24"
              content={
                <div className="flex flex-row gap-4 text-lg">
                  {isCustomAgent && agentAnalytics?.feedbacks ? (
                    <>
                      <div className="flex flex-row items-center">
                        <HandThumbUpIcon className="w-7 pr-2 text-gray-400 dark:text-muted-foreground-night" />
                        <div>{agentAnalytics.feedbacks.positiveFeedbacks}</div>
                      </div>
                      <div className="flex flex-row items-center">
                        <HandThumbDownIcon className="w-7 pr-2 text-gray-400 dark:text-muted-foreground-night" />
                        <div>{agentAnalytics.feedbacks.negativeFeedbacks}</div>
                      </div>
                    </>
                  ) : (
                    "-"
                  )}
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
    </>
  );

  if (hideHeader) {
    return <div className="flex flex-col gap-6 pt-4">{content}</div>;
  }

  return (
    <TabContentLayout
      title="Insights"
      headerAction={
        <SharedObservabilityFilterSelector
          workspaceId={owner.sId}
          agentConfigurationId={agentConfigurationId}
          isCustomAgent={isCustomAgent}
        />
      }
    >
      {content}
    </TabContentLayout>
  );
}
