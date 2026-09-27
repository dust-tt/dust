import type {
  AdditionalConfigurationInBuilderType,
  MCPServerConfigurationType,
} from "@app/components/shared/tools_picker/types";
import { getDefaultAdditionalConfiguration } from "@app/lib/actions/default_mcp_action";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import set from "lodash/set";

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
    timeFrame: null,
    additionalConfiguration: {},
    dustAppConfiguration: null,
    dustProject: null,
    jsonSchema: null,
    _jsonSchemaString: null,
    secretName: null,
  };

  if (!mcpServerView) {
    return defaults;
  }

  // The builder form nests the inputs along their dot-separated paths.
  const additionalConfig: AdditionalConfigurationInBuilderType = {};
  for (const [key, value] of Object.entries(
    getDefaultAdditionalConfiguration(mcpServerView)
  )) {
    set(additionalConfig, key, value);
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
