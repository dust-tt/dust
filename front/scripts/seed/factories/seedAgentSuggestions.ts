import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";

import type { CreatedAgent, SeedContext, SuggestionAsset } from "./types";

export interface SeedAgentSuggestionsOptions {
  agents: Map<string, CreatedAgent>;
}

export async function seedAgentSuggestions(
  ctx: SeedContext,
  suggestionAssets: SuggestionAsset[],
  options: SeedAgentSuggestionsOptions
): Promise<void> {
  const { auth, execute, logger } = ctx;
  const { agents } = options;

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

      // Check if a similar suggestion already exists
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
          JSON.stringify(suggestionAsset.suggestion)
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
          suggestion: suggestionAsset.suggestion,
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
