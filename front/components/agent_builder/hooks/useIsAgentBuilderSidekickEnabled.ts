import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";

export function useIsAgentBuilderSidekickEnabled(): boolean {
  const { owner, isAdmin } = useAgentBuilderContext();
  const { hasFeature } = useFeatureFlags();
  const isBuilder = owner.role === "builder";
  return (
    hasFeature("agent_builder_copilot") &&
    (isAdmin || (hasFeature("agent_builder_copilot_builders") && isBuilder))
  );
}
