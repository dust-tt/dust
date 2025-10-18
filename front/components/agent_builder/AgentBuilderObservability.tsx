import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { ToolExecutionChart } from "@app/components/agent_builder/observability/ToolExecutionChart";
import { UsageMetricsChart } from "@app/components/agent_builder/observability/UsageMetricsChart";
import { useAgentConfiguration } from "@app/lib/swr/assistants";

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

  return (
    <div className="flex h-full flex-col space-y-6 overflow-y-auto">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Observability</h2>
        <p className="text-sm text-muted-foreground">
          Monitor key metrics and performance indicators for your agent.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <UsageMetricsChart
          workspaceId={owner.sId}
          agentConfigurationId={agentConfiguration.sId}
        />
        <ToolExecutionChart
          workspaceId={owner.sId}
          agentConfigurationId={agentConfiguration.sId}
        />
      </div>
    </div>
  );
}
