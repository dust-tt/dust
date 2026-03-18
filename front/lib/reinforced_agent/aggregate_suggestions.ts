import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import { buildToolsAndSkillsContext } from "@app/lib/api/assistant/global_agents/sidekick_context";
import type { LLMStreamParameters } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import { notifyAgentSuggestionsReady } from "@app/lib/notifications/workflows/agent-suggestions-ready";
import {
  type AgentContextSkill,
  formatAgentContext,
} from "@app/lib/reinforced_agent/format_agent_context";
import {
  buildReinforcedLLMParams,
  runReinforcedAnalysis,
} from "@app/lib/reinforced_agent/run_reinforced_analysis";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import logger from "@app/logger/logger";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type {
  AgentInstructionsSuggestionType,
  AgentSkillsSuggestionType,
  AgentToolsSuggestionType,
} from "@app/types/suggestions/agent_suggestion";

type ReinforcedSuggestionType =
  | AgentInstructionsSuggestionType
  | AgentToolsSuggestionType
  | AgentSkillsSuggestionType;

const REINFORCED_SUGGESTION_KINDS = new Set([
  "instructions",
  "tools",
  "skills",
]);

interface AggregationContext {
  agentConfig: AgentConfigurationType;
  syntheticSuggestions: AgentSuggestionResource[];
  prompt: { systemPrompt: string; userMessage: string };
}

function toReinforcedSuggestions(
  suggestions: AgentSuggestionResource[]
): ReinforcedSuggestionType[] {
  return suggestions
    .map((s) => s.toJSON())
    .filter((json): json is ReinforcedSuggestionType =>
      REINFORCED_SUGGESTION_KINDS.has(json.kind)
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
    variant: "full",
  });
  if (!agentConfig) {
    logger.warn(
      { agentConfigurationId },
      "ReinforcedAgent: agent not found for aggregation"
    );
    return null;
  }

  const REJECTED_SUGGESTIONS_MAX_COUNT = 20;
  const REJECTED_SUGGESTIONS_MAX_AGE_MONTHS = 3;

  const [
    pendingSuggestions,
    rejectedSuggestions,
    toolsAndSkillsContext,
    agentSkills,
  ] = await Promise.all([
    AgentSuggestionResource.listByAgentConfigurationId(
      auth,
      agentConfigurationId,
      {
        sources: ["reinforcement", "sidekick"],
        states: ["pending"],
      }
    ),
    AgentSuggestionResource.listByAgentConfigurationId(
      auth,
      agentConfigurationId,
      {
        sources: ["reinforcement", "sidekick"],
        states: ["rejected"],
        limit: REJECTED_SUGGESTIONS_MAX_COUNT,
      }
    ),
    buildToolsAndSkillsContext(auth),
    SkillResource.listByAgentConfiguration(auth, agentConfig),
  ]);

  const rejectedCutoff = new Date();
  rejectedCutoff.setMonth(
    rejectedCutoff.getMonth() - REJECTED_SUGGESTIONS_MAX_AGE_MONTHS
  );
  const recentRejectedSuggestions = rejectedSuggestions.filter(
    (s) => s.createdAt >= rejectedCutoff
  );

  const prompt = buildAggregationPrompt(
    agentConfig,
    toReinforcedSuggestions(syntheticSuggestions),
    {
      pending: toReinforcedSuggestions(pendingSuggestions),
      rejected: toReinforcedSuggestions(recentRejectedSuggestions),
    },
    toolsAndSkillsContext,
    agentSkills
  );

  return { agentConfig, syntheticSuggestions, prompt };
}

function formatSuggestion(s: ReinforcedSuggestionType): string {
  switch (s.kind) {
    case "instructions":
      return `kind: instructions
targetBlockId: ${s.suggestion.targetBlockId}
analysis: ${s.analysis ?? "N/A"}
content: ${s.suggestion.content}`;
    case "tools":
      return `kind: tools
action: ${s.suggestion.action}
toolId: ${s.suggestion.toolId}
analysis: ${s.analysis ?? "N/A"}`;
    case "skills":
      return `kind: skills
action: ${s.suggestion.action}
skillId: ${s.suggestion.skillId}
analysis: ${s.analysis ?? "N/A"}`;
  }
}

function formatSuggestions(suggestions: ReinforcedSuggestionType[]): string {
  return suggestions
    .map((s, i) => `### Suggestion ${i + 1}\n${formatSuggestion(s)}`)
    .join("\n\n");
}

export function buildAggregationPrompt(
  agentConfig: AgentConfigurationType,
  syntheticSuggestions: ReinforcedSuggestionType[],
  existingSuggestions: {
    pending: ReinforcedSuggestionType[];
    rejected: ReinforcedSuggestionType[];
  },
  toolsAndSkillsContext: string,
  agentSkills: AgentContextSkill[]
): { systemPrompt: string; userMessage: string } {
  const systemPrompt = `You are an AI agent improvement analyst. You have been given multiple suggestions from individual conversation analyses for the same agent. Your job is to deduplicate, merge, and prioritize them into a concise set of high-quality, actionable suggestions.

## Your task
- Merge suggestions that address the same issue, or that target the same block
- Keep only the most impactful suggestions (max 5)
- In the analysis, mention how many conversations support each suggestion
- When calling suggest_prompt_edits, make sure there is never more than one suggestion targeting the same block (including instructions-root)
- Do NOT create suggestions that are too similar to existing pending suggestions (listed below) — they are already being reviewed
- Do NOT create suggestions that are too similar to previously rejected suggestions (listed below) — they will get rejected again
- It is perfectly fine to return empty suggestions arrays if there is nothing new to say

You have three tools available:
- suggest_prompt_edits: For instruction changes.
- suggest_tools: For suggesting tools to add or remove.
- suggest_skills: For suggesting skills to add or remove.

You MUST call at least one tool. If no suggestions survive aggregation, call suggest_prompt_edits with an empty suggestions array.`;

  let userMessage = `${formatAgentContext(agentConfig, agentSkills)}

${toolsAndSkillsContext}

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
