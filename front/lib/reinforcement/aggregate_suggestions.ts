import type { LLMStreamParameters } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import { formatSkillContext } from "@app/lib/reinforcement/format_skill_context";
import { buildReinforcedSkillsLLMParams } from "@app/lib/reinforcement/run_reinforced_analysis";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import logger from "@app/logger/logger";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";

const AGGREGATION_ASSEMBLY_ORDER = [
  "primary",
  "aggregation_rules",
  "suggestion_tool_calls",
] as const;

type AggregationSectionKey = (typeof AGGREGATION_ASSEMBLY_ORDER)[number];

const REINFORCED_SKILL_AGGREGATION_SECTIONS: Record<
  AggregationSectionKey,
  string
> = {
  primary: `You improve a skill's configuration by consolidating many draft suggestions. Each draft was produced from a single conversation that used the skill.
Your job is to produce a subset of the highest quality suggestions for the skill builder to review.

You have access to the following tools:
- suggest_skill_instruction_edits: For suggesting instruction changes to the skill.
- suggest_skill_tools: For suggesting tools to add or remove from the skill.

Your goal is to keep the most impactful suggestions. NEVER create more than 5 suggestions.
You MUST follow <aggregation_rules> to determine the final set of suggestions.
You will call suggestion tools to create each of the final suggestions. You MUST follow <suggestion_tool_calls> for each suggestion.
`,

  aggregation_rules: `
Start by grouping suggestions by type:
- For instruction edits, group by the target skill.
- For tool changes, group by the target tool within each skill.
NEVER create more than one suggestion per target.

Rank the groups based on impact to the skill. Use these heuristics in priority order to determine highest impact:
- The number of conversations that exhibited the issue
- Suggestions that were directly generated based on user feedback
- Suggestions that were directly generated based on a user response to an agent message
- Suggestions that change or enhance the core skill capabilities

Use your discretion on what suggestions will most improve the skill's ability to handle the user's intent.

You SHOULD drop suggestions that only have minor impact and are only supported by a single conversation.

There may be situations where suggestions are co-dependent. For example, there may be an instruction suggestion that requires a tool suggestion to be effective. In this case, NEVER create one suggestion without the other.`,

  suggestion_tool_calls: `
You are provided all of the attributes associated with a conversation suggestion. You MUST use these EXACT attributes to create the final suggestion.
The only exception is the "analysis" attribute. You MUST provide a new analysis based on why you picked the suggestion. The end user does NOT care about the technical considerations behind your thought process.
The analysis MUST be a user-facing explanation of why the suggestion is impactful and how many conversations support the suggestion.
`,
};

export function buildSkillAggregationSystemPrompt(): string {
  return AGGREGATION_ASSEMBLY_ORDER.map((key) => {
    const body = REINFORCED_SKILL_AGGREGATION_SECTIONS[key].trim();
    return `<${key}>\n${body}\n</${key}>`;
  }).join("\n\n");
}

function formatSuggestion(s: SkillSuggestionType): string {
  switch (s.kind) {
    case "edit_instructions":
      return `kind: edit_instructions
skillId: ${s.skillConfigurationId}
analysis: ${s.analysis ?? "N/A"}
instructions: ${s.suggestion.instructions}`;
    case "tools":
      return `kind: tools
skillId: ${s.skillConfigurationId}
action: ${s.suggestion.action}
toolId: ${s.suggestion.toolId}
analysis: ${s.analysis ?? "N/A"}`;
    case "create":
      return `kind: create
skillId: ${s.skillConfigurationId}
analysis: ${s.analysis ?? "N/A"}`;
  }
}

function formatSuggestions(suggestions: SkillSuggestionType[]): string {
  return suggestions
    .map((s, i) => `### Suggestion ${i + 1}\n${formatSuggestion(s)}`)
    .join("\n\n");
}

export function buildSkillAggregationPrompt(
  skill: SkillType,
  syntheticSuggestions: SkillSuggestionType[],
  existingSuggestions: {
    pending: SkillSuggestionType[];
    rejected: SkillSuggestionType[];
  }
): { systemPrompt: string; userMessage: string } {
  const systemPrompt = buildSkillAggregationSystemPrompt();

  let userMessage = `${formatSkillContext(skill)}

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

interface SkillAggregationContext {
  skill: SkillResource;
  syntheticSuggestions: SkillSuggestionResource[];
  prompt: { systemPrompt: string; userMessage: string };
}

export async function loadSkillAggregationContext(
  auth: Authenticator,
  skillId: string
): Promise<SkillAggregationContext | null> {
  const syntheticSuggestions =
    await SkillSuggestionResource.listBySkillConfigurationId(auth, skillId, {
      sources: ["synthetic"],
      states: ["pending"],
    });

  if (syntheticSuggestions.length === 0) {
    return null;
  }

  const skill = await SkillResource.fetchById(auth, skillId);
  if (!skill) {
    logger.warn(
      { skillId },
      "ReinforcedSkills: skill not found for aggregation"
    );
    return null;
  }

  const REJECTED_SUGGESTIONS_MAX_COUNT = 20;
  const REJECTED_SUGGESTIONS_MAX_AGE_MONTHS = 3;

  const [pendingSuggestions, rejectedSuggestions] = await Promise.all([
    SkillSuggestionResource.listBySkillConfigurationId(auth, skillId, {
      sources: ["reinforcement"],
      states: ["pending"],
    }),
    SkillSuggestionResource.listBySkillConfigurationId(auth, skillId, {
      sources: ["reinforcement"],
      states: ["rejected"],
      limit: REJECTED_SUGGESTIONS_MAX_COUNT,
    }),
  ]);

  const rejectedCutoff = new Date();
  rejectedCutoff.setMonth(
    rejectedCutoff.getMonth() - REJECTED_SUGGESTIONS_MAX_AGE_MONTHS
  );
  const recentRejectedSuggestions = rejectedSuggestions.filter(
    (s) => s.createdAt >= rejectedCutoff
  );

  const skillType = skill.toJSON(auth);

  const prompt = buildSkillAggregationPrompt(
    skillType,
    syntheticSuggestions.map((s) => s.toJSON()),
    {
      pending: pendingSuggestions.map((s) => s.toJSON()),
      rejected: recentRejectedSuggestions.map((s) => s.toJSON()),
    }
  );

  return { skill, syntheticSuggestions, prompt };
}

/**
 * Build the batch map for skill aggregation.
 * Returns null if there are no pending synthetic suggestions or the skill is not found.
 */
export async function buildSkillAggregationBatchMap(
  auth: Authenticator,
  skillId: string
): Promise<Map<string, LLMStreamParameters> | null> {
  const ctx = await loadSkillAggregationContext(auth, skillId);
  if (!ctx) {
    return null;
  }

  return new Map([["aggregation", buildReinforcedSkillsLLMParams(ctx.prompt)]]);
}
