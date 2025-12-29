import {
  Button,
  CardGrid,
  ContentMessage,
  HandThumbDownIcon,
  HandThumbUpIcon,
  LoadingBlock,
  Separator,
  Spinner,
  ValueCard,
} from "@dust-tt/sparkle";

import { DatasourceRetrievalTreemapChart } from "@app/components/agent_builder/observability/charts/DatasourceRetrievalTreemapChart";
import { LatencyChart } from "@app/components/agent_builder/observability/charts/LatencyChart";
import { SourceChart } from "@app/components/agent_builder/observability/charts/SourceChart";
import { ToolUsageChart } from "@app/components/agent_builder/observability/charts/ToolUsageChart";
import { UsageMetricsChart } from "@app/components/agent_builder/observability/charts/UsageMetricsChart";
import { useObservabilityContext } from "@app/components/agent_builder/observability/ObservabilityContext";
import { TabContentChildSectionLayout } from "@app/components/agent_builder/observability/TabContentChildSectionLayout";
import { TabContentLayout } from "@app/components/agent_builder/observability/TabContentLayout";
import { SharedObservabilityFilterSelector } from "@app/components/observability/SharedObservabilityFilterSelector";
import {
  useAgentAnalytics,
  useAgentObservabilitySummary,
} from "@app/lib/swr/assistants";
import { useFeatureFlags } from "@app/lib/swr/workspaces";

interface AgentObservabilityProps {
  workspaceId: string;
  agentConfigurationId: string;
  isCustomAgent: boolean;
}

export function AgentObservability({
  workspaceId,
  agentConfigurationId,
  isCustomAgent,
}: AgentObservabilityProps) {
  const { period, mode, selectedVersion } = useObservabilityContext();
  const { featureFlags } = useFeatureFlags({ workspaceId });

  const isTimeRangeMode = mode === "timeRange";

  const { agentAnalytics, isAgentAnalyticsLoading } = useAgentAnalytics({
    workspaceId,
    agentConfigurationId,
    period,
    version: mode === "version" ? selectedVersion?.version : undefined,
  });

  const shouldShowMessagesPerActiveUser =
    agentAnalytics?.mentions &&
    agentAnalytics.activeUsers > 0 &&
    agentAnalytics.mentions.messageCount > 0;

  const { summaryText, isSummaryLoading, isSummaryError, refetchSummary } =
    useAgentObservabilitySummary({
      workspaceId,
      agentConfigurationId,
      days: period,
      disabled: !isTimeRangeMode,
    });

  return (
    <TabContentLayout
      title="Insights"
      headerAction={
        <SharedObservabilityFilterSelector
          workspaceId={workspaceId}
          agentConfigurationId={agentConfigurationId}
        />
      }
    >
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
        <UsageMetricsChart
          workspaceId={workspaceId}
          agentConfigurationId={agentConfigurationId}
        />
        <Separator />
        <SourceChart
          workspaceId={workspaceId}
          agentConfigurationId={agentConfigurationId}
        />
        {featureFlags.includes("agent_tool_outputs_analytics") && (
          <>
            <Separator />
            <DatasourceRetrievalTreemapChart
              workspaceId={workspaceId}
              agentConfigurationId={agentConfigurationId}
            />
          </>
        )}
        <Separator />
        <ToolUsageChart
          workspaceId={workspaceId}
          agentConfigurationId={agentConfigurationId}
        />
        <Separator />
        <LatencyChart
          workspaceId={workspaceId}
          agentConfigurationId={agentConfigurationId}
        />
      </TabContentChildSectionLayout>
    </TabContentLayout>
  );
}
