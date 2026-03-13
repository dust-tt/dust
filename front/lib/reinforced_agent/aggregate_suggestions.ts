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
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { AgentInstructionsSuggestionType } from "@app/types/suggestions/agent_suggestion";

interface AggregationContext {
  agentConfig: LightAgentConfigurationType;
  syntheticSuggestions: AgentSuggestionResource[];
  prompt: { systemPrompt: string; userMessage: string };
}

function toInstructionsSuggestions(
  suggestions: AgentSuggestionResource[]
): AgentInstructionsSuggestionType[] {
  return suggestions
    .map((s) => s.toJSON())
    .filter(
      (json): json is AgentInstructionsSuggestionType =>
        json.kind === "instructions"
    );
}

async function loadAggregationContext(
  auth: Authenticator,
  agentConfigurationId: string
): Promise<AggregationContext | null> {
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
      "ReinforcedAgent: agent not found for aggregation"
    );
    return null;
  }

  const existingSuggestions =
    await AgentSuggestionResource.listByAgentConfigurationId(
      auth,
      agentConfigurationId,
      {
        sources: ["reinforcement", "sidekick"],
        states: ["pending", "rejected"],
      }
    );

  const existingInstructions = toInstructionsSuggestions(existingSuggestions);

  const prompt = buildAggregationPrompt(
    agentConfig.name,
    toInstructionsSuggestions(syntheticSuggestions),
    {
      pending: existingInstructions.filter((s) => s.state === "pending"),
      rejected: existingInstructions.filter((s) => s.state === "rejected"),
    }
  );

  return { agentConfig, syntheticSuggestions, prompt };
}

function formatSuggestions(
  suggestions: AgentInstructionsSuggestionType[]
): string {
  return suggestions
    .map(
      (s, i) => `### Suggestion ${i + 1}
kind: ${s.kind}
targetBlockId: ${s.suggestion.targetBlockId}
analysis: ${s.analysis ?? "N/A"}
content: ${s.suggestion.content}`
    )
    .join("\n\n");
}

export function buildAggregationPrompt(
  agentName: string,
  syntheticSuggestions: AgentInstructionsSuggestionType[],
  existingSuggestions: {
    pending: AgentInstructionsSuggestionType[];
    rejected: AgentInstructionsSuggestionType[];
  }
): { systemPrompt: string; userMessage: string } {
  const systemPrompt = `You are an AI agent improvement analyst. You have been given multiple suggestions from individual conversation analyses for the same agent. Your job is to deduplicate, merge, and prioritize them into a concise set of high-quality, actionable suggestions.

## Your task
- Merge suggestions that address the same issue, or that target the same block
- Keep only the most impactful suggestions (max 5)
- In the analysis, mention how many conversations support each suggestion
- When calling the tool, make sure there is never more than one suggestion targeting the same block (including instructions-root)
- Do NOT create suggestions that are too similar to existing pending suggestions (listed below) — they are already being reviewed
- Do NOT create suggestions that are too similar to previously rejected suggestions (listed below) — they will get rejected again
- It is perfectly fine to return an empty suggestions array if there is nothing new to say

You MUST call the tool. If no suggestions survive aggregation, return an empty suggestions array.`;

  let userMessage = `## Agent: ${agentName}

## Synthetic suggestions from conversation analyses

${formatSuggestions(syntheticSuggestions)}`;

  if (existingSuggestions.pending.length > 0) {
    userMessage += `

## Existing pending suggestions (do NOT duplicate these)

${formatSuggestions(existingSuggestions.pending)}`;
  }

  if (existingSuggestions.rejected.length > 0) {
    userMessage += `

## Previously rejected suggestions (do NOT recreate similar ones)

${formatSuggestions(existingSuggestions.rejected)}`;
  }

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
  const ctx = await loadAggregationContext(auth, agentConfigurationId);
  if (!ctx) {
    return null;
  }

  return new Map([["aggregation", buildReinforcedLLMParams(ctx.prompt)]]);
}

/**
 * Aggregate synthetic suggestions for an agent into pending suggestions.
 * Marks processed synthetic suggestions as approved.
 */
export async function aggregateSyntheticSuggestions(
  auth: Authenticator,
  agentConfigurationId: string
): Promise<void> {
  const ctx = await loadAggregationContext(auth, agentConfigurationId);
  if (!ctx) {
    return;
  }

  const { agentConfig, syntheticSuggestions, prompt } = ctx;

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
