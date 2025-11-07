import { ObservabilityProvider } from "@app/components/agent_builder/observability/ObservabilityContext";
import { AgentObservability } from "@app/components/observability/AgentObservability";
import type { AgentConfigurationType, WorkspaceType } from "@app/types";

export function AgentInsightsTab({
  owner,
  agentConfiguration,
}: {
  owner: WorkspaceType;
  agentConfiguration: AgentConfigurationType;
}) {
  // Wrap the entire tab in ObservabilityProvider to enable charts + filters state.
  return (
    <ObservabilityProvider>
      <AgentObservability
        workspaceId={owner.sId}
        agentConfigurationId={agentConfiguration.sId}
        allowReactions={agentConfiguration.scope !== "global"}
      />
    </ObservabilityProvider>
  );
}
// thin wrapper only; all logic is inside AgentObservability
