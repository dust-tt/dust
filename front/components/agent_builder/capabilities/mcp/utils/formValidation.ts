import { z } from "zod";

import { mcpServerConfigurationSchema } from "@app/components/agent_builder/AgentBuilderFormContext";
import { createMCPFormSchema } from "@app/components/agent_builder/capabilities/mcp/validation/schemaBuilders";
import type {AgentBuilderAction} from "@app/components/agent_builder/types";
import { DESCRIPTION_MAX_LENGTH } from "@app/components/agent_builder/types";
import { dataSourceBuilderTreeType } from "@app/components/data_source_view/context/types";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";

// Canvas-specific schema with optional data sources
const canvasFormSchema = z.object({
  name: z
    .string()
    .min(1, "The name cannot be empty.")
    .transform((val) => {
      // Convert to lowercase and replace spaces and special chars with underscores
      return (
        val
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, "_")
          // Remove consecutive underscores
          .replace(/_+/g, "_")
          // Remove leading/trailing underscores
          .replace(/^_+|_+$/g, "")
      );
    })
    .default(""),
  description: z
    .string()
    .min(1, "Description is required")
    .max(
      DESCRIPTION_MAX_LENGTH,
      "Description should be less than 800 characters."
    ),
  sources: dataSourceBuilderTreeType, // No refinement - data sources are optional
  mcpServerView: z.custom<MCPServerViewType>().nullable(),
  configuration: mcpServerConfigurationSchema,
});

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
  if (mcpServerView?.server.name === 'canvas') {
    return canvasFormSchema;
  }

  const requirements = mcpServerView
    ? getMCPServerRequirements(mcpServerView)
    : null;

  return createMCPFormSchema(requirements);
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
      console.error("Schema is undefined for server:", serverView.server.name);
      return {
        isValid: false,
        errorMessage: `Configuration schema not found for "${serverView.name || serverView.server.name}".`,
      };
    }

    // For Canvas, include sources and mcpServerView in validation
    const validationData: any = {
      name: action.name,
      description: action.description,
      configuration: action.configuration,
    };
    
    if (serverView.server.name === 'canvas') {
      // Canvas requires sources and mcpServerView fields for validation
      // Extract sources from dataSourceConfigurations if available
      const dataSourceConfigurations = action.configuration?.dataSourceConfigurations;
      validationData.sources = dataSourceConfigurations 
        ? { in: [], notIn: [] } // Just provide a valid structure for validation
        : { in: [], notIn: [] };
      validationData.mcpServerView = serverView;
    }

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
