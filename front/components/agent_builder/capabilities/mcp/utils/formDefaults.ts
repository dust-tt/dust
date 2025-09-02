import set from "lodash/set";

import type {
  AdditionalConfigurationInBuilderType,
  MCPServerConfigurationType,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";

/**
 * Creates default configuration values for MCP server based on requirements
 * @param mcpServerView - The MCP server view to create defaults for
 * @returns Default configuration object
 */
export function getDefaultConfiguration(
  mcpServerView?: MCPServerViewType | null
): MCPServerConfigurationType {
  const requirements = mcpServerView
    ? getMCPServerRequirements(mcpServerView)
    : null;

  const defaults: MCPServerConfigurationType = {
    mcpServerViewId: mcpServerView?.sId ?? "not-a-valid-sId",
    dataSourceConfigurations: null,
    tablesConfigurations: null,
    childAgentId: null,
    reasoningModel: null,
    timeFrame: null,
    additionalConfiguration: {},
    dustAppConfiguration: null,
    jsonSchema: null,
    _jsonSchemaString: null,
  };

  if (!requirements) {
    return defaults;
  }

  const additionalConfig: AdditionalConfigurationInBuilderType = {};

  // Set default values only for boolean and enums
  // Strings and numbers should be left empty to trigger validation
  for (const key of requirements.requiredBooleans) {
    set(additionalConfig, key, false);
  }

  for (const [key, enumValues] of Object.entries(requirements.requiredEnums)) {
    if (enumValues.length > 0) {
      set(additionalConfig, key, enumValues[0]);
    }
  }

  for (const [key] of Object.entries(requirements.requiredLists)) {
    set(additionalConfig, key, []);
  }

  defaults.additionalConfiguration = additionalConfig;

  return defaults;
}

/**
 * Creates default form values with proper configuration
 * @param mcpServerView - The MCP server view
 * @returns Default form data object
 */
export function getDefaultFormValues(mcpServerView: MCPServerViewType | null) {
  const baseValues = {
    name: "",
    description: "",
    configuration: getDefaultConfiguration(mcpServerView),
  };
  
  // You can select data source for canvas
  if (mcpServerView?.server.name === "canvas") {
    return {
      ...baseValues,
      sources: { in: [], notIn: [] },
    };
  }
  
  return baseValues;
}
