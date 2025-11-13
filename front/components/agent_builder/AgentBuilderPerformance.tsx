import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { AgentFeedback } from "@app/components/observability/AgentFeedback";
import { useAgentConfiguration } from "@app/lib/swr/assistants";

interface AgentBuilderPerformanceProps {
  agentConfigurationSId: string;
}

export function AgentBuilderPerformance({
  agentConfigurationSId,
}: AgentBuilderPerformanceProps) {
  const { owner } = useAgentBuilderContext();

  const { agentConfiguration } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId: agentConfigurationSId ?? null,
  });

  if (!agentConfiguration) {
    return null;
  }

  return (
    <AgentFeedback
      owner={owner}
      agentConfigurationId={agentConfiguration.sId}
      allowReactions={agentConfiguration.scope !== "global"}
    />
  );
}
