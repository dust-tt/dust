import { ListCheckIcon } from "@dust-tt/sparkle";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { EmptyPlaceholder } from "@app/components/agent_builder/observability/shared/EmptyPlaceholder";
import { TabContentLayout } from "@app/components/agent_builder/observability/TabContentLayout";
import { AgentFeedback } from "@app/components/observability/AgentFeedback";
import { useAgentConfiguration } from "@app/lib/swr/assistants";

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
    return (
      <TabContentLayout title="Feedback">
        <EmptyPlaceholder
          icon={ListCheckIcon}
          title="Waiting for feedback"
          description="When users give feedback on responses, you'll see it here."
        />
      </TabContentLayout>
    );
  }

  return (
    <AgentFeedback
      owner={owner}
      agentConfigurationId={agentConfiguration.sId}
      allowReactions={agentConfiguration.scope !== "global"}
    />
  );
}
