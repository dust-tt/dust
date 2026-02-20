import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";

export function useIsAgentBuilderCopilotEnabled(): boolean {
  const { isAdmin } = useAgentBuilderContext();
  const { hasFeature } = useFeatureFlags();
  return hasFeature("agent_builder_copilot") && isAdmin;
}
