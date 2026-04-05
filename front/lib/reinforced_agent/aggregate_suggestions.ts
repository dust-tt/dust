import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import {
  createConversation,
  postNewContentFragment,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import { toFileContentFragment } from "@app/lib/api/assistant/conversation/content_fragment";
import { getEditors } from "@app/lib/api/assistant/editors";
import { REINFORCED_TOOLS_DESCRIPTION } from "@app/lib/api/assistant/global_agents/configurations/dust/agent_suggestions_shared";
import type { LLMStreamParameters } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import {
  type AgentContextSkill,
  formatAgentContext,
} from "@app/lib/reinforced_agent/format_agent_context";
import { buildReinforcedLLMParams } from "@app/lib/reinforced_agent/run_reinforced_analysis";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import logger from "@app/logger/logger";
import type {
  AgentConfigurationType,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { pluralize } from "@app/types/shared/utils/string_utils";
import type {
  AgentInstructionsSuggestionType,
  AgentSkillsSuggestionType,
  AgentToolsSuggestionType,
} from "@app/types/suggestions/agent_suggestion";

const AGGREGATION_ASSEMBLY_ORDER = [
  "primary",
  "aggregation_rules",
  "suggestion_tool_calls",
] as const;

type AggregationSectionKey = (typeof AGGREGATION_ASSEMBLY_ORDER)[number];

const REINFORCED_AGGREGATION_SECTIONS: Record<AggregationSectionKey, string> = {
  primary: `You improve an AI agent's configuration by consolidating many draft suggestions. Each draft was produced from a single agent conversation.
Your job is to produce a subset of the highest quality suggestions for the agent builder to review.

${REINFORCED_TOOLS_DESCRIPTION}

Your goal is to keep the most impactful suggestions. NEVER create more than 5 suggestions.
You MUST follow <aggregation_rules> to determine the final set of suggestions.
You will call suggestion tools to create each of the final suggestions. You MUST follow <suggestion_tool_calls> for each suggestion.
`,

  aggregation_rules: `
Start by grouping suggestions by target ("targetBlockId" for instructions, "toolId" for tools, "skillId" for skills).
NEVER create more than one suggestion per target.

Rank the groups based on impact to the agent instructions. Use these heuristics in priority order to determine highest impact:
- The number of conversations that exhibited the issue
- Suggestions that were directly generated based on user feedback
- Suggestions that were directly generated based on a user response to an agent message
- Suggestions that change or enhance the core agent capabilities

Use your discretion on what suggestions will most improve the agent's ability to handle the user's intent.

You SHOULD drop suggestions that only have minor impact and are only supported by a single conversation.

There may be situations where suggestions are co-dependent. For example, there may be an instruction suggestion that requires a tool suggestion to be effective. In this case, NEVER create one suggestion without the other.

You MUST drop or generalize suggestions that hardcode overly specific values (exact error messages, specific line numbers, particular variable names, individual ticket IDs, etc.). If the suggestion can be generalized into a broader, reusable rule, rewrite it. If not, drop it entirely.`,

  suggestion_tool_calls: `
You are provided all of the attributes associated with a conversation suggestion. You MUST use these EXACT attributes to create the final suggestion.
The only exception is the "analysis" attribute. You MUST provide a new analysis based on why you picked the suggestion. The end user does NOT care about the technical consideratations behind your thought process.
The analysis MUST be a user-facing explanation of why the suggestion is impactful and how many conversations support the suggestion.
`,
};

export function buildAggregationSystemPrompt(): string {
  return AGGREGATION_ASSEMBLY_ORDER.map((key) => {
    const body = REINFORCED_AGGREGATION_SECTIONS[key].trim();
    return `<${key}>\n${body}\n</${key}>`;
  }).join("\n\n");
}

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

export async function loadAggregationContext(
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

  const [pendingSuggestions, rejectedSuggestions, agentSkills] =
    await Promise.all([
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
  agentSkills: AgentContextSkill[]
): { systemPrompt: string; userMessage: string } {
  const systemPrompt = buildAggregationSystemPrompt();

  let userMessage = `${formatAgentContext(agentConfig, agentSkills)}

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
 * Create a conversation with the pending suggestions for the agent editors.
 */
export async function createAgentSuggestionsConversations(
  auth: Authenticator,
  agentConfiguration: LightAgentConfigurationType
): Promise<void> {
  const editors = await getEditors(auth, agentConfiguration);
  if (editors.length === 0) {
    return;
  }

  const pendingSuggestions =
    await AgentSuggestionResource.listByAgentConfigurationId(
      auth,
      agentConfiguration.sId,
      { sources: ["reinforcement"], states: ["pending"] }
    );

  if (pendingSuggestions.length === 0) {
    return;
  }

  const formattedSuggestions = formatSuggestions(
    toReinforcedSuggestions(pendingSuggestions)
  );

  const conversationTitle = `Reinforced suggestions for @${agentConfiguration.name}`;
  const conversation = await createConversation(auth, {
    title: conversationTitle,
    visibility: "unlisted",
    spaceId: null,
    metadata: {
      reinforcedAgentNotification: {
        agentName: agentConfiguration.name,
        agentConfigurationId: agentConfiguration.sId,
      },
    },
  });

  const contentFragmentRes = await toFileContentFragment(auth, {
    contentFragment: {
      title: `${pendingSuggestions.length} pending suggestions for @${agentConfiguration.name}`,
      content: formattedSuggestions,
      contentType: "text/plain",
      url: null,
    },
    fileName: "suggestions.txt",
  });

  if (contentFragmentRes.isErr()) {
    logger.error(
      {
        agentConfigurationId: agentConfiguration.sId,
        error: contentFragmentRes.error.message,
      },
      "Failed to create content fragment for suggestions conversation"
    );
    return;
  }

  const author = editors[0];

  const contentFragmentPostRes = await postNewContentFragment(
    auth,
    conversation,
    contentFragmentRes.value,
    {
      username: author.username,
      fullName: author.fullName,
      email: author.email,
      profilePictureUrl: author.image,
    }
  );

  if (contentFragmentPostRes.isErr()) {
    logger.error(
      {
        agentConfigurationId: agentConfiguration.sId,
        error: contentFragmentPostRes.error.message,
      },
      "ReinforcedAgent: failed to post content fragment for suggestions conversation"
    );
    return;
  }

  const messageRes = await postUserMessage(auth, {
    conversation,
    content: `Here are ${pendingSuggestions.length} pending improvement${pluralize(pendingSuggestions.length)} suggestions for the @${agentConfiguration.name} agent.`,
    mentions: [{ configurationId: GLOBAL_AGENTS_SID.DUST }],
    context: {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
      username: author.username,
      fullName: author.fullName,
      email: author.email,
      profilePictureUrl: author.image,
      origin: "reinforced_agent_notification",
    },
    skipToolsValidation: true,
  });

  if (messageRes.isErr()) {
    logger.error(
      {
        agentConfigurationId: agentConfiguration.sId,
        error: messageRes.error.api_error.message,
      },
      "ReinforcedAgent: failed to post user message for suggestions conversation"
    );
    return;
  }

  for (const editor of editors) {
    await ConversationResource.upsertParticipation(auth, {
      conversation,
      action: "posted",
      user: editor,
      lastReadAt: null,
    });
  }
}
