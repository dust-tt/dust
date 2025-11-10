import {
  CardGrid,
  Chip,
  HandThumbDownIcon,
  HandThumbUpIcon,
  Separator,
  Spinner,
  ValueCard,
} from "@dust-tt/sparkle";
import { useMemo } from "react";

import { LatencyChart } from "@app/components/agent_builder/observability/charts/LatencyChart";
import { ToolUsageChart } from "@app/components/agent_builder/observability/charts/ToolUsageChart";
import { UsageMetricsChart } from "@app/components/agent_builder/observability/charts/UsageMetricsChart";
import { useObservabilityContext } from "@app/components/agent_builder/observability/ObservabilityContext";
import { TabContentChildSectionLayout } from "@app/components/agent_builder/observability/TabContentChildSectionLayout";
import { TabContentLayout } from "@app/components/agent_builder/observability/TabContentLayout";
import { getErrorRateChipInfo } from "@app/components/agent_builder/observability/utils";
import { SharedObservabilityFilterSelector } from "@app/components/observability/SharedObservabilityFilterSelector";
import type { ErrorRatePoint } from "@app/lib/api/assistant/observability/error_rate";
import { useAgentAnalytics, useAgentErrorRate } from "@app/lib/swr/assistants";

function getAverageErrorRate(errorRate: ErrorRatePoint[], period: number) {
  const totalErrorRate = errorRate.reduce(
    (sum, current) => sum + current.errorRate,
    0
  );
  return Math.round((totalErrorRate / period) * 10) / 10;
}

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
  const { period } = useObservabilityContext();

  const { errorRate } = useAgentErrorRate({
    workspaceId,
    agentConfigurationId,
    days: period,
    disabled: !workspaceId || !agentConfigurationId,
  });

  const avrErrorRate = useMemo(
    () => getAverageErrorRate(errorRate, period),
    [errorRate, period]
  );

  const errorRateChipInfo = getErrorRateChipInfo(avrErrorRate);

  const { agentAnalytics, isAgentAnalyticsLoading } = useAgentAnalytics({
    workspaceId,
    agentConfigurationId,
    period,
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
            <Spinner variant="dark" />
          </div>
        ) : (
          <CardGrid>
            <ValueCard
              title="Active Users"
              className="h-24"
              content={
                <div className="flex flex-col gap-1 text-2xl">
                  {agentAnalytics?.users ? (
                    <div className="truncate text-foreground dark:text-foreground-night">
                      {agentAnalytics.users.length}
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
