import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import { getShrinkWrappedConversation } from "@app/lib/api/assistant/conversation/shrink_wrap";
import {
  REINFORCED_TOOLS_DESCRIPTION,
  SHARED_PROMPT_SECTIONS,
} from "@app/lib/api/assistant/global_agents/configurations/dust/agent_suggestions_shared";
import type { LLMStreamParameters } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import {
  type AgentContextSkill,
  formatAgentContext,
} from "@app/lib/reinforced_agent/format_agent_context";
import { buildReinforcedLLMParams } from "@app/lib/reinforced_agent/run_reinforced_analysis";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import logger from "@app/logger/logger";
import type { AgentConfigurationType } from "@app/types/assistant/agent";

const ASSEMBLY_ORDER = [
  "primary",
  "analysis_workflow",
  "conversation_analysis",
  "instructions_guidance",
  "skills_tools_guidance",
  "instruction_suggestion_formatting",
] as const;

type SectionKey = (typeof ASSEMBLY_ORDER)[number];

export const REINFORCED_ANALYSIS_SECTIONS: Record<SectionKey, string> = {
  primary: `You are an AI agent improvement analyst. Your job is to analyze a conversation handled by an AI agent and suggest concrete improvements to the agent's configuration.

${REINFORCED_TOOLS_DESCRIPTION}

You MUST follow <analysis_workflow>. These steps are entirely focused on identifying potential agent improvements and calling the suggestion tools as an end result.`,

  analysis_workflow: `Follow this process for every conversation you analyze:

Step 1: Review the <agent_context> from the user message to understand the intent of the agent configuration (look at <preserve_agent_goals> to understand why).

Step 2: Analyze the conversation and identify improvement areas for the agent configuration.
The conversation is in <conversation>. See <conversation_analysis> for guidance on how to analyze the conversation.

Step 3: Build a plan. Based on the identified areas of improvement, determine specific suggestions to modify the agent configuration. Dimensions you MUST consider:
- Review instructions to determine if the agent is meeting the user intent and properly utilizing the configured capabilities: <instructions_guidance>.
- If the agent references or requires external actions or knowledges, then tools and/or skills are required. See <skills_tools_guidance>.

You can NOT suggest other types of agent configuration changes (i.e. knowledge). Only suggest instructions, skills, and tools.

Step 4: For each suggestion, you MUST include an "analysis" field explaining why this change would improve the agent.
This MUST include the signal that was discovered in <conversation_analysis> that led to the suggestion.
Subsequently, an aggregation workflow will use this analysis to determine which suggestions are most impactful.

Step 5: Make suggestions. You MUST refer to <instruction_suggestion_formatting> for instruction suggestions.
ONLY make suggestions that will effect the agent behavior. NEVER suggest cosmetic-only fixes.
`,

  conversation_analysis: `ALWAYS inspect the full conversation, which is a chronological timeline of messages. Each message has an index, sId, sender (user or
agent name), actions, and content. Here are key signals for potential improvements in order of importance:

1. If the user provided feedback, it will be included with each message in the form of thumbs up/down and comments
This is the MOST important signal as it is directly provided by the user and an explicit signal.

2. User response to an agent message. Any user indication of confusion, disagreement, or correction is a signal of dissatisfaction. A user follow-up question or request could mean the initial agent response was useful, but the agent could be improved in terms of proactively providing that information or performing the action without user intervention.

3. You should look for tool calls that indicate the agent is unsure how to perform an action (and is actively exploring options) or receiving unexpected results. A general principle is that you want to suggest improvements that increase the chances that the agent can replicate a successful workflow in the future. You will need to assess the tool call pattern and make a subjective judgement.

Example: The user asks, "Create a Gmail draft replying to Thread X". The agent calls gmail__search_messages 4 times with different vague queries, then tries gmail__create_reply_draft twice with different ID fields (Message-ID header, then thread id) and finally succeeds only after trial-and-error.
This pattern suggests instruction gaps (which identifier to pass, and the expected call chain).

4. Missing capabilities the agent should have. Call get_available_tools and get_available_skills to discover what tools and skills are available in the workspace. Determine if more information or actions could have been provided to the user to improve satisfaction and increase user productivity. When making these types of suggestions, you MUST ensure that they are inline with the goal/role of the agent.

A key consideration is that conversations can be user-specific, but agents are usually shared. You MUST ensure that the suggestions are useful for all users of the agent.`,

  instructions_guidance: SHARED_PROMPT_SECTIONS.instructionsGuidance,

  skills_tools_guidance: SHARED_PROMPT_SECTIONS.skillsToolsGuidance,

  instruction_suggestion_formatting:
    SHARED_PROMPT_SECTIONS.instructionSuggestionFormatting,
};

export function buildAnalysisSystemPrompt(): string {
  return ASSEMBLY_ORDER.map((key) => {
    const body = REINFORCED_ANALYSIS_SECTIONS[key].trim();
    return `<${key}>\n${body}\n</${key}>`;
  }).join("\n\n");
}

export function buildAnalysisPrompt(
  agentConfig: AgentConfigurationType,
  conversationText: string,
  agentSkills: AgentContextSkill[]
): { systemPrompt: string; userMessage: string } {
  const systemPrompt = buildAnalysisSystemPrompt();

  const userMessage = `<agent_context>
${formatAgentContext(agentConfig, agentSkills)}
</agent_context>

<conversation>
${conversationText}
</conversation>
`;

  return { systemPrompt, userMessage };
}

/**
 * Build the batch map for conversation analysis.
 * Returns null if there are no valid conversations or the agent is global.
 */
export async function buildConversationAnalysisBatchMap(
  auth: Authenticator,
  {
    agentConfigurationId,
    conversationIds,
  }: {
    agentConfigurationId: string;
    conversationIds: string[];
  }
): Promise<Map<string, LLMStreamParameters> | null> {
  const [agentConfig] = await getAgentConfigurations(auth, {
    agentIds: [agentConfigurationId],
    variant: "full",
  });
  if (!agentConfig || agentConfig.id < 0) {
    return null;
  }

  const agentSkills = await SkillResource.listByAgentConfiguration(
    auth,
    agentConfig
  );

  const batchMap = new Map<string, LLMStreamParameters>();

  for (const conversationId of conversationIds) {
    const conversationRes = await getShrinkWrappedConversation(auth, {
      conversationId,
      includeFeedback: true,
      includeActionDetails: true,
    });
    if (conversationRes.isErr()) {
      logger.warn(
        { conversationId, error: conversationRes.error },
        "ReinforcedAgent: conversation not found, skipping in batch"
      );
      continue;
    }

    const prompt = buildAnalysisPrompt(
      agentConfig,
      conversationRes.value.text,
      agentSkills
    );
    batchMap.set(conversationId, buildReinforcedLLMParams(prompt));
  }

  return batchMap.size > 0 ? batchMap : null;
}
