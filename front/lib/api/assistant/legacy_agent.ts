import type { AgentConfigurationType } from "@app/types";

export function isLegacyAgentConfiguration(
  agentConfiguration: AgentConfigurationType
): boolean {
  return (
    agentConfiguration.actions.length === 1 &&
    !agentConfiguration.actions[0].description
  );
}
