import {
  createConversation,
  postNewContentFragment,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import { toFileContentFragment } from "@app/lib/api/assistant/conversation/content_fragment";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import type { LLMStreamParameters } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import { formatSkillContext } from "@app/lib/reinforcement/format_skill_context";
import { buildReinforcedSkillsLLMParams } from "@app/lib/reinforcement/run_reinforced_analysis";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { getSkillBuilderRoute } from "@app/lib/utils/router";
import logger from "@app/logger/logger";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import { escapeXml } from "@app/types/shared/utils/string_utils";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";
import type { UserType } from "@app/types/user";

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
- edit_skill: For suggesting instruction edits and tool add/remove for one skill. The skill block above includes <agentFacingDescription> when set (for context only); you MUST NOT use edit_skill to change it.
- reject_suggestion: For discarding source suggestions that are invalid, not actionable, or too similar to already declined suggestions. Do NOT reject minor but valid suggestions, simply ignore them.

Your goal is to keep the most impactful suggestions. NEVER create more than 5 suggestions.
You MUST follow <aggregation_rules> to determine the final set of suggestions.
You will call edit_skill to create each of the final suggestions and reject_suggestion to discard bad ones. Minor ones will just be ignored and not included in any tool.
You MUST follow <suggestion_tool_calls> for each suggestion.

IMPORTANT: Both edit_skill and reject_suggestion are terminal calls — you will NOT be called again after using them. Not all suggestions must be included in edit_skill or reject_suggestion, low impact but valid ones must be simply ignored.
It is ok to simply call no tool if all suggestions are minor.
`,

  aggregation_rules: `
Start by grouping suggestions by skill, then within each skill group by topic:
- For instruction edits, group by coherent theme within the skill (e.g. tone, tool usage, formatting). Suggestions that address different topics MUST be kept as separate suggestions — do NOT merge unrelated topics into one suggestion.
- For tool changes, group by the target tool within each skill. NEVER create more than one suggestion per tool.
NEVER create more than one suggestion per (skill, topic) pair.

Rank the groups based on impact to the skill. Use these heuristics in priority order to determine highest impact:
- The number of conversations that exhibited the issue
- Suggestions that were directly generated based on user feedback
- Suggestions that were directly generated based on a user response to an agent message
- Suggestions that change or enhance the core skill capabilities

Use your discretion on what suggestions will most improve the skill's ability to handle the user's intent.

Classify the groups in these 3 categories:
 - impactful -> create a new suggestion for the most impactful ones.
 - minor -> just ignore them, call no tool for these suggestions
 - invalid or too similar to existing declined/pending suggestions -> call reject_suggestion

You SHOULD ignore suggestions that only have minor impact and are only supported by a single conversation (don't reject them, do NOT call reject_suggestion, just take no action for these suggestions).

There may be situations where suggestions are co-dependent. For example, there may be an instruction suggestion that requires a tool suggestion to be effective. In this case, NEVER create one suggestion without the other.`,

  suggestion_tool_calls: `
You are provided all of the attributes associated with a conversation suggestion. You MUST use these EXACT attributes to create the final suggestion.
The only exceptions are the "analysis", "title", and "sourceSuggestionIds" attributes; these MUST be newly authored for each final suggestion.

For "analysis": Provide a user-facing explanation of why the suggestion is impactful and how many conversations support it. The end user does NOT care about the technical considerations behind your thought process.

For "title": You MUST provide a short, action-oriented, user-facing title that summarizes what the suggestion changes. The title MUST be at most 25 characters. Examples: "Clarify response tone", "Add Slack search tool", "Remove GitHub tool". Each suggestion MUST have a distinct title.

For "sourceSuggestionIds": You MUST include the sIds of ALL the source suggestions that were consolidated into this final suggestion. Each suggestion has an sId attribute. Every final suggestion MUST reference at least one source suggestion.
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
    case "edit": {
      let xml = `<suggestion kind="edit" sId="${escapeXml(s.sId)}"><skillId>${escapeXml(s.skillConfigurationId)}</skillId><analysis>${escapeXml(s.analysis ?? "N/A")}</analysis>`;
      if (s.suggestion.instructionEdits?.length) {
        xml += "<instructionEdits>";
        for (const e of s.suggestion.instructionEdits) {
          xml += `<instructionEdit targetBlockId="${escapeXml(e.targetBlockId)}" type="${escapeXml(e.type)}"><content>${escapeXml(e.content)}</content></instructionEdit>`;
        }
        xml += "</instructionEdits>";
      }
      if (s.suggestion.toolEdits?.length) {
        xml += "<toolEdits>";
        for (const t of s.suggestion.toolEdits) {
          xml += `<toolEdit action="${escapeXml(t.action)}" toolId="${escapeXml(t.toolId)}"/>`;
        }
        xml += "</toolEdits>";
      }
      xml += "</suggestion>";
      return xml;
    }
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

  return new Map([
    [
      "aggregation",
      buildReinforcedSkillsLLMParams(
        ctx.prompt,
        "reinforcement_aggregate_suggestions"
      ),
    ],
  ]);
}

/**
 * Random canned opener for the notification conversation, merged into a single
 * message with the suggestion titles between the intro and outro lines.
 */
function buildReinforcedSkillInitialMessage(
  workspaceId: string,
  skillName: string,
  skillId: string,
  titles: string[]
): string {
  const builderUrl = getSkillBuilderRoute(workspaceId, skillId);
  const variants: Array<{ intro: string; outro: string }> = [
    {
      intro: `Dust has analyzed conversations in your workspace that use the ${skillName} skill and found suggestions to improve it:`,
      outro: `You can view and apply these suggestions by going to the [skill builder](${builderUrl}).`,
    },
    {
      intro: `Based on recent conversations, Dust has identified ways to enhance the ${skillName} skill:`,
      outro: `Head over to the [skill builder](${builderUrl}) to review and apply these improvements.`,
    },
    {
      intro: `Dust has reviewed how the ${skillName} skill is being used and has new improvement suggestions:`,
      outro: `Check them out in the [skill builder](${builderUrl}) and apply the ones you like.`,
    },
  ];
  const { intro, outro } =
    variants[Math.floor(Math.random() * variants.length)];
  const list = titles.map((t) => `- ${t}`).join("\n");
  return `${intro}\n${list}\n\n${outro}`;
}

/**
 * Create a conversation with the pending suggestions for the skill editors.
 * It's a single notification conversation that's sent to all editors of the skill.
 */
export async function createSkillSuggestionsConversation(
  auth: Authenticator,
  skill: SkillResource,
  editors: UserType[]
): Promise<void> {
  if (editors.length === 0) {
    return;
  }

  const skillType = skill.toJSON(auth);

  const pendingSuggestions =
    await SkillSuggestionResource.listBySkillConfigurationId(
      auth,
      skillType.sId,
      { sources: ["reinforcement"], states: ["pending"] }
    );

  if (pendingSuggestions.length === 0) {
    return;
  }

  const formattedSuggestions = formatSuggestions(
    pendingSuggestions.map((s) => s.toJSON())
  );

  const conversationTitle = `Reinforced suggestions for ${skillType.name} skill`;
  const conversation = await createConversation(auth, {
    title: conversationTitle,
    visibility: "unlisted",
    spaceId: null,
    metadata: {
      reinforcedSkillNotification: {
        skillName: skillType.name,
        skillId: skillType.sId,
      },
    },
  });

  await SkillSuggestionResource.bulkSetNotificationConversation(
    auth,
    pendingSuggestions,
    conversation.id
  );

  const contentFragmentRes = await toFileContentFragment(auth, {
    contentFragment: {
      title: `${pendingSuggestions.length} pending suggestions for ${skillType.name} skill`,
      content: formattedSuggestions,
      contentType: "text/plain",
      url: null,
    },
    fileName: "suggestions.txt",
    skipDataSourceIndexing: true,
  });

  if (contentFragmentRes.isErr()) {
    logger.error(
      {
        skillId: skillType.sId,
        error: contentFragmentRes.error.message,
      },
      "ReinforcedSkills: failed to create content fragment for suggestions conversation"
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
        skillId: skillType.sId,
        error: contentFragmentPostRes.error.message,
      },
      "ReinforcedSkills: failed to post content fragment for suggestions conversation"
    );
    return;
  }

  const content = buildReinforcedSkillInitialMessage(
    auth.getNonNullableWorkspace().sId,
    skillType.name,
    skillType.sId,
    pendingSuggestions.map((s) => s.title ?? s.sId)
  );

  const messageRes = await postUserMessage(auth, {
    conversation,
    content,
    mentions: [{ configurationId: GLOBAL_AGENTS_SID.DUST }],
    context: {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
      username: author.username,
      fullName: author.fullName,
      email: author.email,
      profilePictureUrl: author.image,
      origin: "reinforced_skill_notification",
    },
    skipToolsValidation: true,
  });

  if (messageRes.isErr()) {
    logger.error(
      {
        skillId: skillType.sId,
        error: messageRes.error.api_error.message,
      },
      "ReinforcedSkills: failed to post user message for suggestions conversation"
    );
    return;
  }

  await concurrentExecutor(
    editors,
    (editor) =>
      ConversationResource.upsertParticipation(auth, {
        conversation,
        action: "posted",
        user: editor,
        lastReadAt: null,
      }),
    { concurrency: 8 }
  );
}

/**
 * Posts a short status update to each notification conversation affected by an
 * accept/reject action, so editors can see progress on the TODO list posted by
 * `createSkillSuggestionsConversation`.
 *
 * Best-effort: errors are logged and never propagated, so the PATCH call does
 * not fail if the conversation is gone or inaccessible.
 */
export async function postSkillSuggestionStatusUpdate(
  auth: Authenticator,
  suggestions: SkillSuggestionResource[],
  state: "approved" | "rejected"
): Promise<void> {
  const user = auth.user();
  if (!user) {
    return;
  }

  // Group suggestions by their notification conversation sId.
  const byConversation = new Map<string, SkillSuggestionResource[]>();
  for (const s of suggestions) {
    if (!s.notificationConversationId) {
      continue;
    }
    const list = byConversation.get(s.notificationConversationId) ?? [];
    list.push(s);
    byConversation.set(s.notificationConversationId, list);
  }

  if (byConversation.size === 0) {
    return;
  }

  const verb = state === "approved" ? "accepted" : "rejected";
  const marker = state === "approved" ? "✅" : "❌";

  for (const [conversationId, items] of byConversation) {
    const conversationRes = await getConversation(auth, conversationId);
    if (conversationRes.isErr()) {
      logger.warn(
        {
          conversationId,
          error: conversationRes.error.message,
        },
        "ReinforcedSkills: failed to fetch notification conversation for status update"
      );
      continue;
    }
    const conversation = conversationRes.value;

    const titles = items.map((s) => s.title ?? s.sId);
    const actorName = user.fullName();
    const content =
      items.length === 1
        ? `${marker} ${actorName} ${verb} "${titles[0]}"`
        : `${actorName} ${verb}:\n${titles.map((t) => `${marker} ${t}`).join("\n")}`;

    const postRes = await postUserMessage(auth, {
      conversation,
      content,
      mentions: [{ configurationId: GLOBAL_AGENTS_SID.DUST }],
      context: {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
        username: user.username,
        fullName: actorName,
        email: user.email,
        profilePictureUrl: user.imageUrl,
        origin: "reinforced_skill_notification",
      },
      skipToolsValidation: true,
    });

    if (postRes.isErr()) {
      logger.warn(
        {
          conversationId,
          error: postRes.error.api_error.message,
        },
        "ReinforcedSkills: failed to post status update to notification conversation"
      );
      continue;
    }

    // postUserMessage marks the conversation read at T1, but the Dust static
    // reply will bump `updatedAt` to T2 and make the conversation re-appear
    // as unread for the acting editor. Push `lastReadAt` a minute into the
    // future so the ack holds through the imminent agent completion — the
    // NOOP reply lands within milliseconds.
    await ConversationResource.markAsReadForAuthUser(auth, {
      conversation,
      lastReadAt: new Date(Date.now() + 60_000),
    });
  }
}
