import {
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  LoadingBlock,
} from "@dust-tt/sparkle";
import { useEffect } from "react";

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
  useAgentConfiguration,
  useAgentVersionMarkers,
} from "@app/lib/swr/assistants";

interface AgentBuilderObservabilityProps {
  agentConfigurationSId: string;
}

export function AgentBuilderObservability({
  agentConfigurationSId,
}: AgentBuilderObservabilityProps) {
  const { owner } = useAgentBuilderContext();

  const { agentConfiguration, isAgentConfigurationLoading } =
    useAgentConfiguration({
      workspaceId: owner.sId,
      agentConfigurationId: agentConfigurationSId,
    });

  if (!agentConfiguration) {
    return null;
  }

  return (
    <ObservabilityProvider>
      <div className="flex h-full flex-col space-y-6 overflow-y-auto">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground dark:text-foreground-night">
              Observability
            </h2>
            <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Monitor key metrics and performance indicators for your agent.
            </span>
          </div>

          <HeaderGlobalSelector agentConfigurationId={agentConfigurationSId} />
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
            <Button label={`${period}d`} size="xs" variant="outline" isSelect />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {OBSERVABILITY_TIME_RANGE.map((p) => (
              <DropdownMenuItem
                key={p}
                label={`${p}d`}
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
