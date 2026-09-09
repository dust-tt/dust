import { AgentRequirementsResource } from "@app/lib/resources/agent/agent_requirements_resource";

export function updateAgentRequirements(
  ...args: Parameters<typeof AgentRequirementsResource.update>
): ReturnType<typeof AgentRequirementsResource.update> {
  return AgentRequirementsResource.update(...args);
}
