import type { AutoInternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  isAutoInternalMCPServerName,
  isInternalMCPServerName,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type {
  SubAgentSuggestionType,
  ToolsSuggestionType,
} from "@app/types/suggestions/agent_suggestion";

import type { CreatedAgent, SeedContext, SuggestionAsset } from "./types";

export interface SeedAgentSuggestionsOptions {
  agents: Map<string, CreatedAgent>;
}

/**
 * Resolves MCP server view IDs from internal server names for tool suggestions.
 * Tool suggestions in the seed data use the internal MCP server name (e.g., "web_search_&_browse")
 * but the actual suggestion needs the MCPServerView sId which is workspace-specific.
 */
async function resolveToolSuggestion(
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

/**
 * Resolves sub-agent suggestions from seed data.
 * Sub-agent suggestions in seed data use childAgentId with agent name (resolved to actual sId).
 * Also resolves the run_agent tool ID.
 */
async function resolveSubAgentSuggestion(
  ctx: SeedContext,
  suggestion: SubAgentSuggestionType,
  agents: Map<string, CreatedAgent>
): Promise<SubAgentSuggestionType> {
  const { auth } = ctx;

  // Resolve childAgentId (which contains the agent name in seed data) to actual sId
  const childAgent = agents.get(suggestion.childAgentId);
  if (!childAgent) {
    throw new Error(
      `Failed to resolve child agent "${suggestion.childAgentId}" - agent not found`
    );
  }

  // Resolve the run_agent tool ID
  const serverNamesToResolve = [suggestion.toolId]
    .filter((id) => isInternalMCPServerName(id))
    .filter((id): id is AutoInternalMCPServerNameType =>
      isAutoInternalMCPServerName(id)
    );

  let resolvedToolId = suggestion.toolId;
  if (serverNamesToResolve.length > 0) {
    const mcpServerViews =
      await MCPServerViewResource.getMCPServerViewsForAutoInternalTools(
        auth,
        serverNamesToResolve
      );

    const serverNameToViewSId = new Map<string, string>();
    for (const view of mcpServerViews) {
      const viewJson = view.toJSON();
      if (viewJson) {
        serverNameToViewSId.set(viewJson.server.name, viewJson.sId);
      }
    }

    const toolId = serverNameToViewSId.get(suggestion.toolId);
    if (toolId === undefined) {
      throw new Error(
        `Failed to resolve MCP server view ID for tool "${suggestion.toolId}"`
      );
    }
    resolvedToolId = toolId;
  }

  return {
    action: suggestion.action,
    toolId: resolvedToolId,
    childAgentId: childAgent.sId,
  };
}

export async function seedAgentSuggestions(
  ctx: SeedContext,
  suggestionAssets: SuggestionAsset[],
  options: SeedAgentSuggestionsOptions
): Promise<void> {
  const { auth, execute, logger } = ctx;
  const { agents } = options;

  if (
    suggestionAssets.some((s) => s.kind === "tools" || s.kind === "sub_agent")
  ) {
    // To seed tool/sub_agent suggestions we need the MCP server views to exist.
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

      // Resolve suggestions that need ID resolution
      let resolvedSuggestion = suggestionAsset.suggestion;
      if (suggestionAsset.kind === "tools") {
        resolvedSuggestion = await resolveToolSuggestion(
          ctx,
          suggestionAsset.suggestion
        );
      } else if (suggestionAsset.kind === "sub_agent") {
        resolvedSuggestion = await resolveSubAgentSuggestion(
          ctx,
          suggestionAsset.suggestion,
          agents
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
