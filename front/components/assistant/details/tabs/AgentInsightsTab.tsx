import { ObservabilityProvider } from "@app/components/agent_builder/observability/ObservabilityContext";
import { AgentObservability } from "@app/components/observability/AgentObservability";
import type { AgentConfigurationType, WorkspaceType } from "@app/types";

interface AgentInsightsTabProps {
  owner: WorkspaceType;
  agentConfiguration: AgentConfigurationType;
}

export function AgentInsightsTab({
  owner,
  agentConfiguration,
}: AgentInsightsTabProps) {
  return (
    <ObservabilityProvider>
      <AgentObservability
        workspaceId={owner.sId}
        agentConfigurationId={agentConfiguration.sId}
        isCustomAgent={agentConfiguration.scope !== "global"}
      />
    </ObservabilityProvider>
  );
}
