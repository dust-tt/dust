import { useState } from "react";
import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { ToolExecutionChart } from "@app/components/agent_builder/observability/ToolExecutionChart";
import { ToolLatencyChart } from "@app/components/agent_builder/observability/ToolLatencyChart";
import { UsageMetricsChart } from "@app/components/agent_builder/observability/UsageMetricsChart";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import type { ObservabilityTimeRangeType } from "@app/components/agent_builder/observability/constants";
import {
  DEFAULT_PERIOD_DAYS,
  OBSERVABILITY_TIME_RANGE,
} from "@app/components/agent_builder/observability/constants";

interface AgentBuilderObservabilityProps {
  agentConfigurationSId: string;
}

export function AgentBuilderObservability({
  agentConfigurationSId,
}: AgentBuilderObservabilityProps) {
  const { owner } = useAgentBuilderContext();

  const { agentConfiguration } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId: agentConfigurationSId,
  });

  if (!agentConfiguration) {
    return null;
  }

  const [period, setPeriod] =
    useState<ObservabilityTimeRangeType>(DEFAULT_PERIOD_DAYS);

  return (
    <div className="flex h-full flex-col space-y-6 overflow-y-auto">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Observability
          </h2>
          <p className="text-sm text-muted-foreground">
            Monitor key metrics and performance indicators for your agent.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button label={`${period}d`} size="xs" variant="outline" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
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
      </div>

      <div className="grid grid-cols-1 gap-6">
        <UsageMetricsChart
          workspaceId={owner.sId}
          agentConfigurationId={agentConfiguration.sId}
          period={period}
          onPeriodChange={setPeriod}
        />
        <ToolExecutionChart
          workspaceId={owner.sId}
          agentConfigurationId={agentConfiguration.sId}
          period={period}
          onPeriodChange={setPeriod}
        />
        <ToolLatencyChart
          workspaceId={owner.sId}
          agentConfigurationId={agentConfiguration.sId}
          period={period}
          onPeriodChange={setPeriod}
        />
      </div>
    </div>
  );
}
