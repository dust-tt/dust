import {
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  CardGrid,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  HandThumbDownIcon,
  HandThumbUpIcon,
  LoadingBlock,
  Spinner,
  ValueCard,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { ErrorRateChart } from "@app/components/agent_builder/observability/charts/ErrorRateChart";
import { FeedbackDistributionChart } from "@app/components/agent_builder/observability/charts/FeedbackDistributionChart";
import { LatencyChart } from "@app/components/agent_builder/observability/charts/LatencyChart";
import { ToolUsageChart } from "@app/components/agent_builder/observability/charts/ToolUsageChart";
import { UsageMetricsChart } from "@app/components/agent_builder/observability/charts/UsageMetricsChart";
import {
  CHART_CONTAINER_HEIGHT_CLASS,
  OBSERVABILITY_TIME_RANGE,
} from "@app/components/agent_builder/observability/constants";
import { ExportFeedbackCsvButton } from "@app/components/agent_builder/observability/ExportFeedbackCSVButton";
import {
  ObservabilityProvider,
  useObservability,
} from "@app/components/agent_builder/observability/ObservabilityContext";
import { StartConversationWithFredButton } from "@app/components/agent_builder/observability/StartConversationWithFredButton";
import {
  useAgentAnalytics,
  useAgentConfiguration,
  useAgentVersionMarkers,
} from "@app/lib/swr/assistants";

interface AgentBuilderObservabilityProps {
  agentConfigurationSId: string;
}

const PERIODS = [
  { value: 7, label: "Last 7 days" },
  { value: 15, label: "Last 15 days" },
  { value: 30, label: "Last 30 days" },
] as const;

type PeriodValue = (typeof PERIODS)[number]["value"];
const DEFAULT_PERIOD_VALUE: PeriodValue = 30;

export function AgentBuilderObservability({
  agentConfigurationSId,
}: AgentBuilderObservabilityProps) {
  const { owner } = useAgentBuilderContext();
  const [period, setPeriod] = useState(DEFAULT_PERIOD_VALUE);

  const { agentConfiguration, isAgentConfigurationLoading } =
    useAgentConfiguration({
      workspaceId: owner.sId,
      agentConfigurationId: agentConfigurationSId,
    });

  const { agentAnalytics, isAgentAnalyticsLoading } = useAgentAnalytics({
    workspaceId: owner.sId,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    agentConfigurationId: agentConfiguration?.sId || null,
    period,
  });

  if (!agentConfiguration) {
    return null;
  }

  return (
    <ObservabilityProvider>
      <div className="flex h-full flex-col space-y-6 overflow-y-auto">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-foreground dark:text-foreground-night">
            Insights
          </h2>

          <HeaderGlobalSelector agentConfigurationId={agentConfigurationSId} />
        </div>

        <div>
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
                  <div className="flex flex-row gap-2 text-2xl">
                    {agentAnalytics?.mentions
                      ? `${agentAnalytics.mentions.conversationCount}`
                      : "-"}
                  </div>
                }
              />
              <ValueCard
                title="Reactions"
                className="h-24"
                content={
                  <div className="flex flex-row gap-4 text-2xl">
                    {agentConfiguration.scope !== "global" &&
                    agentAnalytics?.feedbacks ? (
                      <>
                        <div className="flex flex-row items-center">
                          <HandThumbUpIcon className="w-7 pr-2 text-muted-foreground dark:text-muted-foreground-night" />
                          <div>
                            {agentAnalytics.feedbacks.positiveFeedbacks}
                          </div>
                        </div>
                        <div className="flex flex-row items-center">
                          <HandThumbDownIcon className="w-7 pr-2 text-muted-foreground dark:text-muted-foreground-night" />
                          <div>
                            {agentAnalytics.feedbacks.negativeFeedbacks}
                          </div>
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
        </div>

        <div className="flex gap-2">
          <ExportFeedbackCsvButton
            agentConfigurationSId={agentConfigurationSId}
          />
          <StartConversationWithFredButton
            agentConfigurationSId={agentConfigurationSId}
          />
        </div>
        <div className="grid grid-cols-1 gap-6">
          {isAgentConfigurationLoading ? (
            <>
              <ChartContainerSkeleton />
              <ChartContainerSkeleton />
              <ChartContainerSkeleton />
              <ChartContainerSkeleton />
              <ChartContainerSkeleton />
            </>
          ) : (
            <>
              <UsageMetricsChart
                workspaceId={owner.sId}
                agentConfigurationId={agentConfiguration.sId}
              />
              <FeedbackDistributionChart
                workspaceId={owner.sId}
                agentConfigurationId={agentConfiguration.sId}
              />
              <ToolUsageChart
                workspaceId={owner.sId}
                agentConfigurationId={agentConfiguration.sId}
              />
              <ErrorRateChart
                workspaceId={owner.sId}
                agentConfigurationId={agentConfiguration.sId}
              />
              <LatencyChart
                workspaceId={owner.sId}
                agentConfigurationId={agentConfiguration.sId}
              />
            </>
          )}
        </div>
      </div>
    </ObservabilityProvider>
  );
}

function HeaderGlobalSelector({
  agentConfigurationId,
}: {
  agentConfigurationId: string;
}) {
  const {
    mode,
    setMode,
    period,
    setPeriod,
    selectedVersion,
    setSelectedVersion,
  } = useObservability();

  const { owner } = useAgentBuilderContext();
  const { versionMarkers, isVersionMarkersLoading } = useAgentVersionMarkers({
    workspaceId: owner.sId,
    agentConfigurationId,
    days: period,
    disabled: false,
  });

  // Default to latest version when entering version mode with available markers
  useEffect(() => {
    if (
      mode === "version" &&
      !selectedVersion &&
      versionMarkers &&
      versionMarkers.length > 0
    ) {
      const latest = versionMarkers[versionMarkers.length - 1];
      setSelectedVersion(latest.version);
    }
  }, [mode, selectedVersion, versionMarkers, setSelectedVersion]);

  return (
    <div className="flex items-center gap-3 pr-2">
      <ButtonsSwitchList defaultValue={mode} size="xs">
        <ButtonsSwitch
          value="timeRange"
          label="Time range"
          onClick={() => setMode("timeRange")}
        />
        <ButtonsSwitch
          value="version"
          label="Version"
          onClick={() => setMode("version")}
        />
      </ButtonsSwitchList>

      {mode === "timeRange" ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              label={`${period} days`}
              size="xs"
              variant="outline"
              isSelect
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {OBSERVABILITY_TIME_RANGE.map((p) => (
              <DropdownMenuItem
                key={p}
                label={`${p} days`}
                onClick={() => setPeriod(p)}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              label={
                selectedVersion
                  ? `v${selectedVersion}`
                  : isVersionMarkersLoading
                    ? "Loading"
                    : "Select"
              }
              size="xs"
              variant="outline"
              isSelect
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(versionMarkers ?? []).map((m) => (
              <DropdownMenuItem
                key={m.version}
                label={`v${m.version}`}
                onClick={() => setSelectedVersion(m.version)}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function ChartContainerSkeleton() {
  return (
    <div
      className={cn(
        "bg-card flex flex-col rounded-lg border border-border p-4",
        CHART_CONTAINER_HEIGHT_CLASS
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
