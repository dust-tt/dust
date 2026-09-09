import { AgentActionConfigurationResource } from "@app/lib/resources/agent/agent_action_configuration_resource";

// Compatibility entrypoint; action reads and writes are owned by the resource.
export function fetchMCPServerActionConfigurations(
  ...args: Parameters<
    typeof AgentActionConfigurationResource.fetchConfigurations
  >
) {
  return AgentActionConfigurationResource.fetchConfigurations(...args);
}
