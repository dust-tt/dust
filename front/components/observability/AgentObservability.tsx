import {
  CardGrid,
  HandThumbDownIcon,
  HandThumbUpIcon,
  Separator,
  Spinner,
  ValueCard,
} from "@dust-tt/sparkle";

import { LatencyChart } from "@app/components/agent_builder/observability/charts/LatencyChart";
import { ToolUsageChart } from "@app/components/agent_builder/observability/charts/ToolUsageChart";
import { UsageMetricsChart } from "@app/components/agent_builder/observability/charts/UsageMetricsChart";
import { useObservabilityContext } from "@app/components/agent_builder/observability/ObservabilityContext";
import { TabContentChildSectionLayout } from "@app/components/agent_builder/observability/TabContentChildSectionLayout";
import { TabContentLayout } from "@app/components/agent_builder/observability/TabContentLayout";
import { SharedObservabilityFilterSelector } from "@app/components/observability/SharedObservabilityFilterSelector";
import { useAgentAnalytics } from "@app/lib/swr/assistants";

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

  const { agentAnalytics, isAgentAnalyticsLoading } = useAgentAnalytics({
    workspaceId,
    agentConfigurationId,
    period,
    version: mode === "version" ? selectedVersion?.version : undefined,
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
                  {agentAnalytics?.mentions
                    ? `${agentAnalytics.mentions.messageCount}`
                    : "-"}
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

      <TabContentChildSectionLayout title="Charts">
        <UsageMetricsChart
          workspaceId={workspaceId}
          agentConfigurationId={agentConfigurationId}
        />
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
