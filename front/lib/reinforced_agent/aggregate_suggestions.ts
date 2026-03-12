import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import type { LLMStreamParameters } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import { notifyAgentSuggestionsReady } from "@app/lib/notifications/workflows/agent-suggestions-ready";
import {
  buildReinforcedLLMParams,
  runReinforcedAnalysis,
} from "@app/lib/reinforced_agent/run_reinforced_analysis";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import logger from "@app/logger/logger";
import type { AgentInstructionsSuggestionType } from "@app/types/suggestions/agent_suggestion";

export function buildAggregationPrompt(
  agentName: string,
  suggestions: AgentInstructionsSuggestionType[]
): { systemPrompt: string; userMessage: string } {
  const suggestionsSection = suggestions
    .map(
      (s, i) => `### Suggestion ${i + 1}
kind: ${s.kind}
targetBlockId: ${s.suggestion.targetBlockId}
analysis: ${s.analysis ?? "N/A"}
content: ${s.suggestion.content}`
    )
    .join("\n\n");

  const systemPrompt = `You are an AI agent improvement analyst. You have been given multiple suggestions from individual conversation analyses for the same agent. Your job is to deduplicate, merge, and prioritize them into a concise set of high-quality, actionable suggestions.

## Your task
- Merge suggestions that address the same issue, or that target the same block
- Keep only the most impactful suggestions (max 5)
- In the analysis, mention how many conversations support each suggestion
- When calling the tool, make sure there is never more than one suggestion targeting the same block (including instructions-root)

You MUST call the tool. If no suggestions survive aggregation, return an empty suggestions array.`;

  const userMessage = `## Agent: ${agentName}

## Synthetic suggestions from conversation analyses

${suggestionsSection}`;

  return { systemPrompt, userMessage };
}

/**
 * Build the batch map for aggregation.
 * Returns null if there are no pending synthetic suggestions or the agent is not found.
 */
export async function buildAggregationBatchMap(
  auth: Authenticator,
  agentConfigurationId: string
): Promise<Map<string, LLMStreamParameters> | null> {
  const syntheticSuggestions =
    await AgentSuggestionResource.listByAgentConfigurationId(
      auth,
      agentConfigurationId,
      { sources: ["synthetic"], states: ["pending"] }
    );

  if (syntheticSuggestions.length === 0) {
    return null;
  }

  const [agentConfig] = await getAgentConfigurations(auth, {
    agentIds: [agentConfigurationId],
    variant: "light",
  });
  if (!agentConfig) {
    logger.warn(
      { agentConfigurationId },
      "ReinforcedAgent: agent not found for aggregation batch"
    );
    return null;
  }

  const instructionsSuggestions = syntheticSuggestions
    .map((s) => s.toJSON())
    .filter(
      (json): json is AgentInstructionsSuggestionType =>
        json.kind === "instructions"
    );

  const prompt = buildAggregationPrompt(
    agentConfig.name,
    instructionsSuggestions
  );
  return new Map([["aggregation", buildReinforcedLLMParams(prompt)]]);
}

/**
 * Aggregate synthetic suggestions for an agent into pending suggestions.
 * Marks processed synthetic suggestions as approved.
 */
export async function aggregateSyntheticSuggestions(
  auth: Authenticator,
  agentConfigurationId: string
): Promise<void> {
  const syntheticSuggestions =
    await AgentSuggestionResource.listByAgentConfigurationId(
      auth,
      agentConfigurationId,
      { sources: ["synthetic"], states: ["pending"] }
    );

  if (syntheticSuggestions.length === 0) {
    return;
  }

  const [agentConfig] = await getAgentConfigurations(auth, {
    agentIds: [agentConfigurationId],
    variant: "light",
  });
  if (!agentConfig) {
    logger.warn(
      { agentConfigurationId },
      "ReinforcedAgent: agent not found for aggregation"
    );
    return;
  }

  const instructionsSuggestions = syntheticSuggestions
    .map((s) => s.toJSON())
    .filter(
      (json): json is AgentInstructionsSuggestionType =>
        json.kind === "instructions"
    );

  const prompt = buildAggregationPrompt(
    agentConfig.name,
    instructionsSuggestions
  );

  const createdCount = await runReinforcedAnalysis({
    auth,
    agentConfig,
    prompt,
    source: "reinforcement",
    operationType: "reinforced_agent_aggregate_suggestions",
    contextId: "n/a",
  });

  if (createdCount > 0) {
    notifyAgentSuggestionsReady(auth, {
      agentConfiguration: agentConfig,
      suggestionCount: createdCount,
    });
  }

  await AgentSuggestionResource.bulkUpdateState(
    auth,
    syntheticSuggestions,
    "approved"
  );

  logger.info(
    {
      agentConfigurationId,
      syntheticCount: syntheticSuggestions.length,
      pendingCreated: createdCount,
    },
    "ReinforcedAgent: aggregated synthetic suggestions into pending"
  );
}
