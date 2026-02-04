import type { AutoInternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  isAutoInternalMCPServerName,
  isInternalMCPServerName,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { ToolsSuggestionType } from "@app/types/suggestions/agent_suggestion";

import type { CreatedAgent, SeedContext, SuggestionAsset } from "./types";

export interface SeedAgentSuggestionsOptions {
  agents: Map<string, CreatedAgent>;
}

/**
 * Resolves MCP server view IDs from internal server names.
 * Tool suggestions in the seed data use the internal MCP server name (e.g., "web_search_&_browse")
 * but the actual suggestion needs the MCPServerView sId which is workspace-specific.
 */
async function resolveMCPServerViewIds(
  ctx: SeedContext,
  suggestion: ToolsSuggestionType
): Promise<ToolsSuggestionType> {
  const { auth } = ctx;

  // Filter additions that are internal MCP server names that need resolution
  const serverNamesToResolve = [suggestion.toolId]
    .filter((id) => isInternalMCPServerName(id))
    .filter((id): id is AutoInternalMCPServerNameType =>
      isAutoInternalMCPServerName(id)
    );

  if (serverNamesToResolve.length === 0) {
    return suggestion;
  }

  // Fetch MCP server views directly by server names (more efficient than listing all)
  const mcpServerViews =
    await MCPServerViewResource.getMCPServerViewsForAutoInternalTools(
      auth,
      serverNamesToResolve
    );

  // Create a map from server name to MCPServerView sId
  const serverNameToViewSId = new Map<string, string>();
  for (const view of mcpServerViews) {
    const viewJson = view.toJSON();
    if (viewJson) {
      serverNameToViewSId.set(viewJson.server.name, viewJson.sId);
    }
  }

  // Resolve the tool IDs
  const resolvedToolId = serverNameToViewSId.get(suggestion.toolId);
  if (resolvedToolId === undefined) {
    throw new Error(
      `Failed to resolve MCP server view ID for tool "${suggestion.toolId}"`
    );
  }

  return {
    ...suggestion,
    toolId: resolvedToolId,
  };
}

export async function seedAgentSuggestions(
  ctx: SeedContext,
  suggestionAssets: SuggestionAsset[],
  options: SeedAgentSuggestionsOptions
): Promise<void> {
  const { auth, execute, logger } = ctx;
  const { agents } = options;

  if (suggestionAssets.some((s) => s.kind === "tools")) {
    // To seed tool suggestions we need the MCP server views to exist.
    await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);
  }

  for (const suggestionAsset of suggestionAssets) {
    const agent = agents.get(suggestionAsset.agentName);
    if (!agent) {
      logger.warn(
        { agentName: suggestionAsset.agentName },
        "Agent not found for suggestion, skipping"
      );
      continue;
    }

    logger.info(
      {
        agentName: suggestionAsset.agentName,
        kind: suggestionAsset.kind,
      },
      "Creating agent suggestion"
    );

    if (execute) {
      // Get the agent configuration
      const agentConfiguration = await getAgentConfiguration(auth, {
        agentId: agent.sId,
        variant: "light",
      });

      if (!agentConfiguration) {
        logger.warn(
          { agentSId: agent.sId },
          "Agent configuration not found, skipping suggestion"
        );
        continue;
      }

      // Resolve MCP server view IDs for tool suggestions
      let resolvedSuggestion = suggestionAsset.suggestion;
      if (suggestionAsset.kind === "tools") {
        resolvedSuggestion = await resolveMCPServerViewIds(
          ctx,
          suggestionAsset.suggestion as ToolsSuggestionType
        );
      }

      // Check if a similar suggestion already exists (after resolution)
      const existingSuggestions =
        await AgentSuggestionResource.listByAgentConfigurationId(
          auth,
          agent.sId,
          { kind: suggestionAsset.kind, limit: 100 }
        );

      // Simple check: if there's already a suggestion of the same kind, skip
      // This is a basic idempotency check - could be made more sophisticated
      const isDuplicate = existingSuggestions.some((s) => {
        const existingSuggestion = s.toJSON();
        return (
          JSON.stringify(existingSuggestion.suggestion) ===
          JSON.stringify(resolvedSuggestion)
        );
      });

      if (isDuplicate) {
        logger.info(
          { agentName: suggestionAsset.agentName, kind: suggestionAsset.kind },
          "Similar suggestion already exists, skipping"
        );
        continue;
      }

      // Create the suggestion using the resource
      await AgentSuggestionResource.createSuggestionForAgent(
        auth,
        agentConfiguration,
        {
          kind: suggestionAsset.kind,
          suggestion: resolvedSuggestion,
          analysis: suggestionAsset.analysis,
          state: "pending",
          source: "copilot",
        }
      );

      logger.info(
        {
          agentName: suggestionAsset.agentName,
          kind: suggestionAsset.kind,
        },
        "Agent suggestion created"
      );
    }
  }
}
