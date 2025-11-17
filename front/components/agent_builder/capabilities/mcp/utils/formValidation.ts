import { createMCPFormSchema } from "@app/components/agent_builder/capabilities/mcp/validation/schemaBuilders";
import type { AgentBuilderAction } from "@app/components/agent_builder/types";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";

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
    const { noRequirement } = getMCPServerRequirements(serverView);

    if (noRequirement) {
      return { isValid: true };
    }

    const schema = getMCPConfigurationFormSchema(serverView);

    schema.parse({
      name: action.name,
      description: action.description,
      configuration: action.configuration,
    });

    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      errorMessage: `Tool "${serverView.name}" has invalid configuration. Please reconfigure it.`,
    };
  }
}
