import { getShrinkWrappedConversation } from "@app/lib/api/assistant/conversation/shrink_wrap";
import type { LLMStreamParameters } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import { formatSkillContext } from "@app/lib/reinforcement/format_skill_context";
import { buildReinforcedSkillsLLMParams } from "@app/lib/reinforcement/run_reinforced_analysis";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import logger from "@app/logger/logger";
import type { SkillType } from "@app/types/assistant/skill_configuration";

const ASSEMBLY_ORDER = [
  "primary_goal",
  "skill_usage_analysis",
  "analysis_workflow",
  "conversation_analysis",
  "instructions_guidance",
  "tools_guidance",
] as const;

type SectionKey = (typeof ASSEMBLY_ORDER)[number];

const REINFORCED_SKILL_ANALYSIS_SECTIONS: Record<SectionKey, string> = {
  primary_goal: `You are a Dust skill improvement analyst. Your job is to analyze a conversation that used one or more skills and suggest concrete improvements to those skills.
A skill bundles tools and instructions that are used by a Dust agent to perform a specific task.

See <skill_usage_analysis> for guidance on how to analyze the relevance of a skill in the conversation.

You MUST follow <analysis_workflow>. These steps are entirely focused on suggesting skill improvements.

Users will not see your response. The user will ONLY see the content of the edit_skill tool calls.

In most conversations, the correct outcome is no configuration change. This means the conversastion did not surface a clear, high-value gap in the skill configuration.
Propose configuration changes only when <analysis_workflow> yields concrete evidence. If you are unsure, do not call edit_skill.

## Exploration tools (optional — use these if you need more context)
- get_available_tools: Lists all tools (MCP servers) available in the workspace. Use this to discover tools you could suggest adding or to verify that suggested tools exist.
`,

  skill_usage_analysis: `In <skill_context>, you have received all custom skills that were enabled in the conversation.
Skills are injected into the agent's system prompt when enabled. This means that every subsequent agent action is influenced by each enabled skill in addition to the agent's system prompt.
The only strong signal of skill influence on the agent behavior is when the agent calls a tool that the skill provides.
You will need to infer the impact of the skill on the agent behavior by checking tool calls and agent messages.`,

  analysis_workflow: `Follow this process for every conversation you analyze:

Step 1: Determine which skills were relevant to the conversation.
For each skill in <skill_context>, ask yourself these questions:
- Were any of the skill's configured tools called in <conversation>? Match the skill's tool names/IDs against the functionCallName in actions.
- Does the conversation topic match the skill's purpose and instructions? Use <agentFacingDescription> and <instructions> inside each <skill> in <skill_context>.
- Was there an enable_skill tool call for the skill? If so, note when. This means the agent made an explicit decision to enable the skill for the rest of the conversation.

At the end of this step, you should have a list of skills you think were relevant to this conversation and should be analyzed for improvements.

Step 2: Go through every message in the conversation and identify areas where the agent behavior could be improved. See <conversation_analysis> for guidance.

Step 3: For each of the areas that could be improved, determine if a skill could be improved to address the issue.
Determine if any skill from Step 1 was relevant to this area of the conversation and could be improved.
Be aware that one conversation is a small sample size. Before suggesting, ALWAYS look at systematic gaps in the skill instructions that could lead to this being a persistent issue.
A key consideration is that conversations can be user-specific, but skills shared across agents and users. You MUST ensure that the suggestions are useful for all users of the skill.

Step 4: For each skill improvement identified in Step 3, formulate a suggestion.
ALWAYS ensure that the suggestion is inline with the skill's purpose and instructions. Skills SHOULD be single purpose and not be overloaded with multiple responsibilities.
Consider the following improvements to a skill:
- Review instructions to determine if the skill is meeting the user intent and properly utilizing the configured tools: <instructions_guidance>.
- If the skill references or requires external actions or knowledge, then tools may need to be added or removed. See <tools_guidance>.
All improvements that should be treated as a single atomic unit should be grouped together in a single suggestion.
NEVER group things that are not related to each other.

Step 5: For each skill, look for agent behavior that is directly aligned with the skill's purpose, but the behavior was not defined in the skill instructions.
This is an opportunity to improve the skill instructions for all future agents and conversations.
Evaluate if any suggestions could improve the behavior of ALL agents and users using that skill.

Step 6: Build a final plan for skill suggestions. You MUST include an "analysis" field explaining why this change would improve the skill.
This MUST include the signal that was discovered in <conversation_analysis> that led to the suggestion.
Subsequently, an aggregation workflow will use this analysis to determine which suggestions are most impactful.

Step 7: Make suggestions.
ONLY make suggestions that will affect the skill behavior. NEVER suggest cosmetic-only fixes.
`,

  conversation_analysis: `ALWAYS inspect the full conversation, which is a chronological timeline of messages. Each message has an index, sId, sender (user or agent name), actions, and content. Here are key signals of areas where the agent behavior could be improved:
1. Feedback - If the user provided feedback, it will be included with each message in the form of thumbs up/down and comments. This is the MOST important signal as it is directly provided by the user and an explicit signal.
2. User reaction - Any user indication of confusion, disagreement, or correction is a signal of dissatisfaction. A user follow-up question or request could mean the skill response was useful, but a skill could be improved in terms of proactively providing that information or performing the action without user intervention.
3. Tool calls - If the tool calls needed to be retried, could a skill's instructions be more clear on how to use that tool?
4. Sequence - Did the agent call the tools in the correct order?
`,

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
  conversationsWithSkills: { conversationId: string; skillIds: string[] }[]
): Promise<Map<string, LLMStreamParameters> | null> {
  const batchMap = new Map<string, LLMStreamParameters>();

  // Collect all unique skill sIds across all conversations.
  const allSkillIds = [
    ...new Set(conversationsWithSkills.flatMap((c) => c.skillIds)),
  ];

  // Fetch all skills at once.
  const skills = await SkillResource.fetchByIds(auth, allSkillIds);
  const skillById = new Map(skills.map((s) => [s.sId, s]));

  for (const { conversationId, skillIds } of conversationsWithSkills) {
    const conversationRes = await getShrinkWrappedConversation(auth, {
      conversationId,
      includeFeedback: true,
      includeActionDetails: true,
    });
    if (conversationRes.isErr()) {
      logger.warn(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          conversationId,
          error: conversationRes.error,
        },
        "ReinforcedSkills: conversation not found, skipping in batch"
      );
      continue;
    }

    const resolvedSkills = skillIds
      .map((sId) => skillById.get(sId))
      .filter((s): s is SkillResource => s !== undefined);

    if (resolvedSkills.length === 0) {
      continue;
    }

    const skillTypes = resolvedSkills.map((s) => s.toJSON(auth));

    const prompt = buildSkillAnalysisPrompt(
      conversationRes.value.text,
      skillTypes
    );
    batchMap.set(conversationId, buildReinforcedSkillsLLMParams(prompt));
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
