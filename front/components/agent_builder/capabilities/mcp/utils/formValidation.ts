import { z } from "zod";

import type { MCPServerConfigurationType } from "@app/components/agent_builder/AgentBuilderFormContext";
import { mcpServerConfigurationSchema } from "@app/components/agent_builder/AgentBuilderFormContext";
import { transformSelectionConfigurationsToTree } from "@app/components/agent_builder/capabilities/knowledge/transformations";
import {
  createBaseFormSchema,
  createMCPFormSchema,
} from "@app/components/agent_builder/capabilities/mcp/validation/schemaBuilders";
import type { AgentBuilderAction } from "@app/components/agent_builder/types";
import type { DataSourceBuilderTreeType } from "@app/components/data_source_view/context/types";
import { dataSourceBuilderTreeType } from "@app/components/data_source_view/context/types";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";

type MCPValidationData = {
  name: string;
  description: string | null;
  configuration: MCPServerConfigurationType | null;
  sources: DataSourceBuilderTreeType;
  mcpServerView?: MCPServerViewType;
};

/**
 * Creates MCP configuration form schema for validation
 * This function should be used with React's useMemo for performance optimization
 *
 * @param mcpServerView - The MCP server view to create schema for
 * @returns Form validation schema
 */
export function getMCPConfigurationFormSchema(
  mcpServerView: MCPServerViewType | null | undefined
) {
  const requirements = mcpServerView
    ? getMCPServerRequirements(mcpServerView)
    : null;

  // Get the base schema with requirements-based validation
  const baseSchema = createMCPFormSchema(requirements);
  
  // All MCP tools now support sources in the form
  // Extend the base schema to include sources
  return z.object({
    ...baseSchema.shape,
    sources: dataSourceBuilderTreeType, // Data sources are optional for all MCP tools
  });
}

/**
 * Validates a configured MCP action against its requirements
 * @param action - The configured action to validate
 * @param serverView - The MCP server view associated with the action
 * @returns Object with validation result and error message if invalid
 */
export function validateMCPActionConfiguration(
  action: AgentBuilderAction,
  serverView: MCPServerViewType
): { isValid: boolean; errorMessage?: string } {
  try {
    const requirements = getMCPServerRequirements(serverView);

    if (requirements.noRequirement) {
      return { isValid: true };
    }

    const schema = getMCPConfigurationFormSchema(serverView);

    if (!schema) {
      return {
        isValid: false,
        errorMessage: `Configuration schema not found for "${serverView.name || serverView.server.name}".`,
      };
    }

    // Include sources for all MCP tools
    const validationData: MCPValidationData = {
      name: action.name,
      description: action.description,
      configuration: action.configuration,
      sources: action.configuration?.dataSourceConfigurations
        ? transformSelectionConfigurationsToTree(
            action.configuration.dataSourceConfigurations
          )
        : { in: [], notIn: [] },
      mcpServerView: serverView,
    };

    schema.parse(validationData);

    return { isValid: true };
  } catch (error) {
    console.error("Validation error for", serverView.server.name, ":", error);
    return {
      isValid: false,
      errorMessage: `Tool "${serverView.name || serverView.server.name}" has invalid configuration. Please reconfigure it.`,
    };
  }
}
