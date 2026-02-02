import { ObservabilityProvider } from "@app/components/agent_builder/observability/ObservabilityContext";
import { CombinedInsightsContent } from "@app/components/observability/CombinedInsightsContent";
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
      <CombinedInsightsContent
        owner={owner}
        agentConfigurationId={agentConfiguration.sId}
        isCustomAgent={agentConfiguration.scope !== "global"}
      />
    </ObservabilityProvider>
  );
}
