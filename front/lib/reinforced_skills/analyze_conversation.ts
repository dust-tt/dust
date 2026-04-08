import { getShrinkWrappedConversation } from "@app/lib/api/assistant/conversation/shrink_wrap";
import type { LLMStreamParameters } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import { formatSkillContext } from "@app/lib/reinforced_skills/format_skill_context";
import { buildReinforcedSkillsLLMParams } from "@app/lib/reinforced_skills/run_reinforced_analysis";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import logger from "@app/logger/logger";
import type { SkillType } from "@app/types/assistant/skill_configuration";

const ASSEMBLY_ORDER = [
  "primary",
  "analysis_workflow",
  "conversation_analysis",
  "instructions_guidance",
  "tools_guidance",
] as const;

type SectionKey = (typeof ASSEMBLY_ORDER)[number];

const REINFORCED_SKILL_ANALYSIS_SECTIONS: Record<SectionKey, string> = {
  primary: `You are a skill improvement analyst. Your job is to analyze a conversation that used one or more skills and suggest concrete improvements to those skills.

You have access to the following tools:

## Exploration tools (optional — use these first if you need more context)
- get_available_tools: Lists all tools (MCP servers) available in the workspace. Use this to discover tools you could suggest adding or to verify that suggested tools exist.

## Suggestion tools (terminal — the conversation ends after these)
- suggest_skill_instruction_edits: For suggesting instruction changes to a skill.
- suggest_skill_tools: For suggesting tools to add or remove from a skill.

You can either:
1. Call get_available_tools first to discover available tools, then make informed suggestions.
2. Go straight to calling suggestion tools if you already have enough context.

You MUST follow <analysis_workflow>. These steps are entirely focused on identifying potential skill improvements and calling the suggestion tools as an end result.
In most conversations, the correct outcome is no configuration change: the thread does not surface a clear, high-value gap in how the skill is set up.
Propose configuration changes only when <conversation_analysis> yields concrete evidence. If you are unsure, call suggest_skill_instruction_edits with an empty suggestions array.`,

  analysis_workflow: `Follow this process for every conversation you analyze:

Step 1: Review the <skill_context> from the user message to understand each skill's purpose and configuration.

Step 2: Analyze the conversation and identify improvement areas for the skill configurations.
The conversation is in <conversation>. See <conversation_analysis> for guidance on how to analyze the conversation.

Step 3: Build a plan. Based on the identified areas of improvement, determine specific suggestions to modify the skill configurations. Dimensions you MUST consider:
- Review instructions to determine if the skill is meeting the user intent and properly utilizing the configured tools: <instructions_guidance>.
- If the skill references or requires external actions or knowledge, then tools may need to be added or removed. See <tools_guidance>.

You can NOT suggest other types of skill configuration changes (e.g. knowledge). Only suggest instructions and tools.

Step 4: For each suggestion, you MUST include an "analysis" field explaining why this change would improve the skill.
This MUST include the signal that was discovered in <conversation_analysis> that led to the suggestion.
Subsequently, an aggregation workflow will use this analysis to determine which suggestions are most impactful.

Step 5: Make suggestions.
ONLY make suggestions that will affect the skill behavior. NEVER suggest cosmetic-only fixes.
`,

  conversation_analysis: `ALWAYS inspect the full conversation, which is a chronological timeline of messages. Each message has an index, sId, sender (user or agent name), actions, and content. Here are key signals for potential improvements in order of importance:

1. If the user provided feedback, it will be included with each message in the form of thumbs up/down and comments.
This is the MOST important signal as it is directly provided by the user and an explicit signal.

2. User response to an agent message. Any user indication of confusion, disagreement, or correction is a signal of dissatisfaction. A user follow-up question or request could mean the skill response was useful, but the skill could be improved in terms of proactively providing that information or performing the action without user intervention.

3. You should look for tool calls that indicate the skill is unsure how to perform an action (and is actively exploring options) or receiving unexpected results. A general principle is that you want to suggest improvements that increase the chances that the skill can replicate a successful workflow in the future.

4. Missing capabilities the skill should have. Call get_available_tools to discover what tools are available in the workspace. Determine if more tools could have been added to the skill to improve satisfaction.

A key consideration is that conversations can be user-specific, but skills are usually shared. You MUST ensure that the suggestions are useful for all users of the skill.`,

  instructions_guidance: `When suggesting instruction improvements for skills, follow these principles:

- Focus on actionable information that changes what the skill does.
- Preserve the skill's existing goals — NEVER change what the goal is, only improve HOW it achieves it.
- Instructions SHOULD reference how to use tools that are configured in the skill.
- Suggestions ALWAYS need to be using the same language as the existing instructions OR, for new skills, the language of the user conversation.
- Prefer small, focused changes over large rewrites.
- Extract the INTENT from examples, not the literal pattern.
- Filter out information only relevant for humans, not the LLM.`,

  tools_guidance: `Tools provide capabilities to the skill. When evaluating tool changes:

- Discover available tools by calling get_available_tools.
- Only suggest adding a tool if there is clear evidence from the conversation that the skill needed a capability it did not have.
- Only suggest removing a tool if there is clear evidence the tool is causing confusion or is unused and cluttering the skill configuration.
- When suggesting a tool addition, ensure the tool exists in the workspace by checking available tools first.`,
};

export function buildSkillAnalysisSystemPrompt(): string {
  return ASSEMBLY_ORDER.map((key) => {
    const body = REINFORCED_SKILL_ANALYSIS_SECTIONS[key].trim();
    return `<${key}>\n${body}\n</${key}>`;
  }).join("\n\n");
}

export function buildSkillAnalysisPrompt(
  conversationText: string,
  skills: SkillType[]
): { systemPrompt: string; userMessage: string } {
  const systemPrompt = buildSkillAnalysisSystemPrompt();

  const skillContexts = skills
    .map((s) => formatSkillContext(s))
    .join("\n\n---\n\n");

  const userMessage = `<skill_context>
${skillContexts}
</skill_context>

<conversation>
${conversationText}
</conversation>
`;

  return { systemPrompt, userMessage };
}

/**
 * Build the batch map for skill conversation analysis.
 * Returns null if there are no valid conversations.
 */
export async function buildSkillConversationAnalysisBatchMap(
  auth: Authenticator,
  conversationsWithSkills: { conversationSId: string; skillSIds: string[] }[]
): Promise<Map<string, LLMStreamParameters> | null> {
  const batchMap = new Map<string, LLMStreamParameters>();

  // Collect all unique skill sIds across all conversations.
  const allSkillSIds = [
    ...new Set(conversationsWithSkills.flatMap((c) => c.skillSIds)),
  ];

  // Fetch all skills at once.
  const skills = await SkillResource.fetchByIds(auth, allSkillSIds);
  const skillBySId = new Map(skills.map((s) => [s.sId, s]));

  for (const { conversationSId, skillSIds } of conversationsWithSkills) {
    const conversationRes = await getShrinkWrappedConversation(auth, {
      conversationId: conversationSId,
      includeFeedback: true,
      includeActionDetails: true,
    });
    if (conversationRes.isErr()) {
      logger.warn(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          conversationSId,
          error: conversationRes.error,
        },
        "ReinforcedSkills: conversation not found, skipping in batch"
      );
      continue;
    }

    const resolvedSkills = skillSIds
      .map((sId) => skillBySId.get(sId))
      .filter((s): s is SkillResource => s !== undefined);

    if (resolvedSkills.length === 0) {
      continue;
    }

    const skillTypes = resolvedSkills.map((s) => s.toJSON(auth));

    const prompt = buildSkillAnalysisPrompt(
      conversationRes.value.text,
      skillTypes
    );
    batchMap.set(conversationSId, buildReinforcedSkillsLLMParams(prompt));
  }

  if (batchMap.size === 0) {
    logger.warn(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        conversationCount: conversationsWithSkills.length,
      },
      "ReinforcedSkills: no conversations could be prepared for analysis batch"
    );
    return null;
  }

  return batchMap;
}
