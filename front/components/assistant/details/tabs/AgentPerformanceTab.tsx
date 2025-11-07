import { ObservabilityProvider } from "@app/components/agent_builder/observability/ObservabilityContext";
import { AgentFeedback } from "@app/components/observability/AgentFeedback";
import type { LightAgentConfigurationType, WorkspaceType } from "@app/types";

interface AgentPerformanceTabProps {
  agentConfiguration: LightAgentConfigurationType;
  owner: WorkspaceType;
}

export function AgentPerformanceTab({
  agentConfiguration,
  owner,
}: AgentPerformanceTabProps) {
  return (
    <ObservabilityProvider>
      <AgentFeedback
        owner={owner}
        agentConfigurationId={agentConfiguration.sId}
        allowReactions={agentConfiguration.scope !== "global"}
      />
    </ObservabilityProvider>
  );
}
