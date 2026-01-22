import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";

/**
 * Registers the get_agent_config tool on the MCP server.
 * This tool allows the copilot to access the live (unsaved) agent builder form state.
 */
export function registerGetAgentConfigTool(
  mcpServer: McpServer,
  getFormValues: () => AgentBuilderFormData
): void {
  mcpServer.tool(
    "get_agent_config",
    "Get the current (unsaved) agent configuration from the agent builder form. Use this to understand what the user is currently configuring for their agent.",
    {},
    () => {
      const formData = getFormValues();

      // Transform form data to the expected tool output format.
      const config = {
        name: formData.agentSettings.name,
        description: formData.agentSettings.description,
        instructions: formData.instructions,
        scope: formData.agentSettings.scope,
        model: {
          modelId: formData.generationSettings.modelSettings.modelId,
          providerId: formData.generationSettings.modelSettings.providerId,
          temperature: formData.generationSettings.temperature,
          reasoningEffort: formData.generationSettings.reasoningEffort,
        },
        tools: formData.actions.map((action) => ({
          sId: action.id,
          name: action.name,
          description: action.description,
        })),
        skills: formData.skills.map((skill) => ({
          sId: skill.sId,
          name: skill.name,
          description: skill.description,
        })),
        maxStepsPerRun: formData.maxStepsPerRun,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(config, null, 2),
          },
        ],
      };
    }
  );
}
