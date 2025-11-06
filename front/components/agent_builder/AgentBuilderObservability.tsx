import {
  CardGrid,
  Chip,
  cn,
  HandThumbDownIcon,
  HandThumbUpIcon,
  LoadingBlock,
  Separator,
  Spinner,
  ValueCard,
} from "@dust-tt/sparkle";
import { useMemo } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { ErrorRateChart } from "@app/components/agent_builder/observability/charts/ErrorRateChart";
import { LatencyChart } from "@app/components/agent_builder/observability/charts/LatencyChart";
import { ToolUsageChart } from "@app/components/agent_builder/observability/charts/ToolUsageChart";
import { UsageMetricsChart } from "@app/components/agent_builder/observability/charts/UsageMetricsChart";
import { useObservabilityContext } from "@app/components/agent_builder/observability/ObservabilityContext";
import { ObservabilityFilterSelector } from "@app/components/agent_builder/observability/ObservabilityFilterSelector";
import { TabContentChildSectionLayout } from "@app/components/agent_builder/observability/TabContentChildSectionLayout";
import { TabContentLayout } from "@app/components/agent_builder/observability/TabContentLayout";
import { getErrorRateChipInfo } from "@app/components/agent_builder/observability/utils";
import type { ErrorRatePoint } from "@app/lib/api/assistant/observability/error_rate";
import {
  useAgentAnalytics,
  useAgentConfiguration,
  useAgentErrorRate,
} from "@app/lib/swr/assistants";

interface AgentBuilderObservabilityProps {
  agentConfigurationSId: string;
}

export function getAverageErrorRate(
  errorRate: ErrorRatePoint[],
  period: number
) {
  const totalErrorRate = errorRate.reduce((sum, current) => {
    return (sum += current.errorRate);
  }, 0);

  return Math.round((totalErrorRate / period) * 10) / 10;
}

export function AgentBuilderObservability({
  agentConfigurationSId,
}: AgentBuilderObservabilityProps) {
  const { owner } = useAgentBuilderContext();
  const { period } = useObservabilityContext();

  const { errorRate } = useAgentErrorRate({
    workspaceId: owner.sId,
    agentConfigurationId: agentConfigurationSId,
    days: period,
    disabled: !owner.sId || !agentConfigurationSId,
  });

  const avrErrorRate = useMemo(
    () => getAverageErrorRate(errorRate, period),
    [errorRate, period]
  );

  const errorRateChipInfo = getErrorRateChipInfo(avrErrorRate);

  const { agentConfiguration, isAgentConfigurationLoading } =
    useAgentConfiguration({
      workspaceId: owner.sId,
      agentConfigurationId: agentConfigurationSId,
    });

  const { agentAnalytics, isAgentAnalyticsLoading } = useAgentAnalytics({
    workspaceId: owner.sId,
    agentConfigurationId: agentConfiguration?.sId ?? null,
    period,
  });

  if (!agentConfiguration) {
    return null;
  }

  return (
    <TabContentLayout
      title="Insights"
      headerAction={
        <ObservabilityFilterSelector
          agentConfigurationId={agentConfigurationSId}
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
                    <>
                      <div className="truncate text-foreground dark:text-foreground-night">
                        {agentAnalytics.users.length}
                      </div>
                    </>
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
              title="Error rate"
              className="h-24"
              content={
                <div className="flex flex-row items-center gap-2 text-2xl">
                  {agentAnalytics?.mentions
                    ? `${agentAnalytics.mentions.conversationCount}`
                    : "-"}
                  <Chip
                    size="mini"
                    color={errorRateChipInfo.color}
                    label={errorRateChipInfo.label}
                    className="h-fit"
                  />
                </div>
              }
            />
            <ValueCard
              title="Reactions"
              className="h-24"
              content={
                <div className="flex flex-row gap-4 text-lg">
                  {agentConfiguration.scope !== "global" &&
                  agentAnalytics?.feedbacks ? (
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
        {isAgentConfigurationLoading ? (
          <div className="grid grid-cols-1 gap-6">
            <ChartContainerSkeleton />
            <ChartContainerSkeleton />
            <ChartContainerSkeleton />
            <ChartContainerSkeleton />
            <ChartContainerSkeleton />
          </div>
        ) : (
          <>
            <UsageMetricsChart
              workspaceId={owner.sId}
              agentConfigurationId={agentConfiguration.sId}
            />
            <Separator />
            <ToolUsageChart
              workspaceId={owner.sId}
              agentConfigurationId={agentConfiguration.sId}
            />
            <Separator />
            <ErrorRateChart
              workspaceId={owner.sId}
              agentConfigurationId={agentConfiguration.sId}
            />
            <Separator />
            <LatencyChart
              workspaceId={owner.sId}
              agentConfigurationId={agentConfiguration.sId}
            />
          </>
        )}
      </TabContentChildSectionLayout>
    </TabContentLayout>
  );
}

function ChartContainerSkeleton() {
  return (
    <div
      className={cn(
        "bg-card flex flex-col rounded-lg border border-border p-4"
      )}
    >
      <div className="mb-4 flex items-center justify-between">
        <LoadingBlock className="h-6 w-40 rounded-md" />
      </div>
      <div className="flex-1">
        <LoadingBlock className="h-full w-full rounded-xl" />
      </div>
    </div>
  );
}
