import { Page } from "@dust-tt/sparkle";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { LatencyDistributionChart } from "@app/components/agent_builder/observability/LatencyDistributionChart";
import { ToolExecutionChart } from "@app/components/agent_builder/observability/ToolExecutionChart";
import { UsageMetricsChart } from "@app/components/agent_builder/observability/UsageMetricsChart";
import { useAgentConfiguration } from "@app/lib/swr/assistants";

function NoAgentState() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center">
      <div className="px-4 text-center">
        <div className="mb-2 text-lg font-medium text-foreground">
          No Observability Data Available
        </div>
        <div className="max-w-sm text-muted-foreground">
          Observability metrics will be available after your agent is created
          and used in conversations.
        </div>
      </div>
    </div>
  );
}

interface AgentBuilderObservabilityProps {
  agentConfigurationSId?: string;
}

export function AgentBuilderObservability({
  agentConfigurationSId,
}: AgentBuilderObservabilityProps) {
  const { owner } = useAgentBuilderContext();

  const { agentConfiguration } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId: agentConfigurationSId ?? null,
  });

  if (!agentConfiguration) {
    return <NoAgentState />;
  }

  return (
    <div className="flex h-full flex-col space-y-6 overflow-y-auto">
      <div>
        <Page.H variant="h5">Observability</Page.H>
        <Page.P>
          Monitor key metrics and performance indicators for your agent.
        </Page.P>
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
        <LatencyDistributionChart
          workspaceId={owner.sId}
          agentConfigurationId={agentConfiguration.sId}
        />
      </div>
    </div>
  );
}
