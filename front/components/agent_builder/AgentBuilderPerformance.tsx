import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { AgentFeedback } from "@app/components/observability/AgentFeedback";
import { useAgentConfiguration } from "@app/lib/swr/assistants";

function NoAgentState() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center">
      <div className="px-4 text-center">
        <div className="mb-2 text-lg font-medium text-foreground">
          No Performance Data Available
        </div>
        <div className="max-w-sm text-muted-foreground">
          Performance metrics will be available after your agent is created and
          used in conversations.
        </div>
      </div>
    </div>
  );
}

interface AgentBuilderPerformanceProps {
  agentConfigurationSId?: string;
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
    return <NoAgentState />;
  }

  return (
    <AgentFeedback
      owner={owner}
      agentConfigurationId={agentConfiguration.sId}
      allowReactions={agentConfiguration.scope !== "global"}
    />
  );
}
