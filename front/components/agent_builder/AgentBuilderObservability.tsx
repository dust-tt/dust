import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Label,
  LoadingBlock,
} from "@dust-tt/sparkle";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import {
  CHART_CONTAINER_HEIGHT_CLASS,
  OBSERVABILITY_TIME_RANGE,
} from "@app/components/agent_builder/observability/constants";
import {
  ObservabilityProvider,
  useObservability,
} from "@app/components/agent_builder/observability/ObservabilityContext";
import { ToolLatencyChart } from "@app/components/agent_builder/observability/charts/ToolLatencyChart";
import { ToolUsageChart } from "@app/components/agent_builder/observability/charts/ToolUsageChart";
import { UsageMetricsChart } from "@app/components/agent_builder/observability/charts/UsageMetricsChart";
import { useAgentConfiguration } from "@app/lib/swr/assistants";

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
            <h2 className="text-lg font-semibold text-foreground">
              Observability
            </h2>
            <span className="text-sm text-muted-foreground dark:text-muted-foreground">
              Monitor key metrics and performance indicators for your agent.
            </span>
          </div>
          <HeaderPeriodDropdown />
        </div>

        <div className="grid grid-cols-1 gap-6">
          {isAgentConfigurationLoading ? (
            <>
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
              <ToolUsageChart
                workspaceId={owner.sId}
                agentConfigurationId={agentConfiguration.sId}
              />
              <ToolLatencyChart
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

function HeaderPeriodDropdown() {
  const { period, setPeriod } = useObservability();
  return (
    <div className="flex items-center gap-2 pr-2">
      <Label>Period:</Label>
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
