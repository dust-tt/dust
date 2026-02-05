import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { AgentSuggestionType } from "@app/types/suggestions/agent_suggestion";

export interface GetAgentConfigCallbacks {
  getFormValues: () => AgentBuilderFormData;
  getPendingSuggestions?: () => AgentSuggestionType[];
  getCommittedInstructionsHtml?: () => string;
}

/**
 * Registers the get_agent_config tool on the MCP server.
 * This tool allows the copilot to access the live (unsaved) agent builder form state.
 */
export function registerGetAgentConfigTool(
  mcpServer: McpServer,
  callbacks: GetAgentConfigCallbacks
): void {
  const { getFormValues, getPendingSuggestions, getCommittedInstructionsHtml } =
    callbacks;

  mcpServer.tool(
    "get_agent_config",
    `Get the current (unsaved) agent configuration from the agent builder form.
Use this to understand what the user is currently configuring for their agent.

The response includes:
- Agent settings (name, description, scope, model, tools, skills)
- instructionsHtml: HTML version of instructions with data-block-id attributes on each block.
  Use these block IDs when making instruction suggestions to target specific blocks.
- pendingSuggestions: Array of suggestions that have been made but not yet accepted/rejected by the user`,
    {},
    () => {
      const formData = getFormValues();

      // HTML instructions with block IDs for targeting specific blocks.
      const instructionsHtml = getCommittedInstructionsHtml?.() ?? "";

      const pendingSuggestions = getPendingSuggestions?.() ?? [];

      const config = {
        name: formData.agentSettings.name,
        description: formData.agentSettings.description,
        instructionsHtml,
        scope: formData.agentSettings.scope,
        model: {
          modelId: formData.generationSettings.modelSettings.modelId,
          providerId: formData.generationSettings.modelSettings.providerId,
          temperature: formData.generationSettings.temperature,
          reasoningEffort: formData.generationSettings.reasoningEffort,
        },
        tools: formData.actions.map((action) => ({
          sId: action.configuration.mcpServerViewId,
          name: action.name,
          description: action.description,
          // If the childAgentId is set, include it
          ...(action.configuration.childAgentId
            ? { childAgentId: action.configuration.childAgentId }
            : {}),
        })),
        skills: formData.skills.map((skill) => ({
          sId: skill.sId,
          name: skill.name,
          description: skill.description,
        })),
        maxStepsPerRun: formData.maxStepsPerRun,
        pendingSuggestions: pendingSuggestions
          .filter((s) => s.state === "pending")
          .map((suggestion) =>
            suggestion.kind === "instructions"
              ? {
                  sId: suggestion.sId,
                  kind: suggestion.kind,
                  ...suggestion.suggestion,
                }
              : {
                  sId: suggestion.sId,
                  kind: suggestion.kind,
                }
          ),
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
