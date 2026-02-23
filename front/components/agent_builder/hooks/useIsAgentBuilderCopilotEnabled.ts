import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { useFeatureFlags } from "@app/lib/swr/workspaces";

export function useIsAgentBuilderCopilotEnabled(): boolean {
  const { owner, isAdmin } = useAgentBuilderContext();
  const { hasFeature } = useFeatureFlags({ workspaceId: owner.sId });
  return hasFeature("agent_builder_copilot") && isAdmin;
}
