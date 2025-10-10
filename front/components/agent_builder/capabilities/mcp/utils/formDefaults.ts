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
    secretName: null,
  };

  if (!mcpServerView) {
    return defaults;
  }

  const {
    requiredLists,
    requiredEnums,
    requiredBooleans,
    requiredStrings,
    requiredNumbers,
  } = getMCPServerRequirements(mcpServerView);

  const additionalConfig: AdditionalConfigurationInBuilderType = {};

  for (const { key, default: defaultValue } of requiredBooleans) {
    set(additionalConfig, key, defaultValue ?? false);
  }

  for (const [key, { options, default: defaultValue }] of Object.entries(
    requiredEnums
  )) {
    if (defaultValue !== undefined) {
      set(additionalConfig, key, defaultValue);
    } else if (options.length > 0) {
      set(additionalConfig, key, options[0].value);
    }
  }

  for (const [key, { default: defaultValue }] of Object.entries(
    requiredLists
  )) {
    set(
      additionalConfig,
      key,
      defaultValue !== undefined ? [defaultValue] : []
    );
  }

  for (const { key, default: defaultValue } of requiredStrings) {
    if (defaultValue !== undefined) {
      set(additionalConfig, key, defaultValue);
    }
  }

  for (const { key, default: defaultValue } of requiredNumbers) {
    if (defaultValue !== undefined) {
      set(additionalConfig, key, defaultValue);
    }
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
  return {
    name: "",
    description: "",
    configuration: getDefaultConfiguration(mcpServerView),
  };
}
