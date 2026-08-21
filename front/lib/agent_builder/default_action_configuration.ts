import type { AgentBuilderMCPConfiguration } from "@app/components/agent_builder/types";
import { getMcpServerViewDescription } from "@app/lib/actions/mcp_helper";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";

export function getDefaultMCPServerActionConfiguration(
  mcpServerView?: MCPServerViewType
): AgentBuilderMCPConfiguration {
  const requirements = getMCPServerRequirements(mcpServerView);

  return {
    configuration: {
      mcpServerViewId: mcpServerView?.sId ?? "not-a-valid-sId",
      dataSourceConfigurations: null,
      tablesConfigurations: null,
      childAgentId: null,
      timeFrame: null,
      additionalConfiguration: {},
      dustAppConfiguration: null,
      dustProject: null,
      jsonSchema: null,
      _jsonSchemaString: null,
      secretName: null,
    },
    name: mcpServerView?.name ?? mcpServerView?.server.name ?? "",
    description:
      requirements.requiresDataSourceConfiguration ||
      requirements.requiresDataWarehouseConfiguration ||
      requirements.requiresTableConfiguration
        ? ""
        : mcpServerView
          ? getMcpServerViewDescription(mcpServerView)
          : "",
    configurationRequired: !requirements.noRequirement,
  };
}
