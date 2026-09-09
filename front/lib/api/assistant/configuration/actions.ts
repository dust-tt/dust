import { AgentActionConfigurationResource } from "@app/lib/resources/agent/agent_action_configuration_resource";

// Compatibility exports; AgentResource owns configuration reads and mutations.
export function createAgentActionConfiguration(
  ...args: Parameters<
    typeof AgentActionConfigurationResource.createAgentActionConfiguration
  >
) {
  return AgentActionConfigurationResource.createAgentActionConfiguration(
    ...args
  );
}
