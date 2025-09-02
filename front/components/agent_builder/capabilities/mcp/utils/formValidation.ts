import { z } from "zod";

import { mcpServerConfigurationSchema } from "@app/components/agent_builder/AgentBuilderFormContext";
import { 
  createBaseFormSchema,
  createMCPFormSchema 
} from "@app/components/agent_builder/capabilities/mcp/validation/schemaBuilders";
import type {AgentBuilderAction} from "@app/components/agent_builder/types";
import { dataSourceBuilderTreeType } from "@app/components/data_source_view/context/types";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";

const canvasFormSchema = z.object({
  ...createBaseFormSchema(),
  sources: dataSourceBuilderTreeType, // No refinement - data sources are optional for canvas
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
      // This is to bypass the validation 
      validationData.sources = { in: [], notIn: [] };
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
