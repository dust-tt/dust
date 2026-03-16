import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import { getShrinkWrappedConversation } from "@app/lib/api/assistant/conversation/shrink_wrap";
import type { LLMStreamParameters } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import {
  buildReinforcedLLMParams,
  runReinforcedAnalysis,
} from "@app/lib/reinforced_agent/run_reinforced_analysis";
import logger from "@app/logger/logger";
import type { AgentConfigurationType } from "@app/types/assistant/agent";

export function buildAnalysisPrompt(
  agentConfig: AgentConfigurationType,
  conversationText: string
): { systemPrompt: string; userMessage: string } {
  const descriptionSection = agentConfig.description
    ? `Description: ${agentConfig.description}`
    : "";
  const instructionsSection = agentConfig.instructionsHtml
    ? `\n### Current instructions\n${agentConfig.instructionsHtml}`
    : "";

  const systemPrompt = `You are an AI agent improvement analyst. Your job is to analyze a conversation handled by an AI agent and suggest concrete improvements to the agent's configuration.

## Your task
Analyze the conversation and identify areas where the agent's instructions could be improved. Pay special attention to any user feedback (thumbs up/down and comments) as direct signals of satisfaction or dissatisfaction. Focus on:
- Cases where the agent misunderstood the user's intent
- Missing knowledge or capabilities the agent should have
- Tone or style improvements based on user reactions and feedback
- Specific instructions that could prevent repeated mistakes

For each suggestion, always include an 'analysis' field explaining why this change would improve the agent.

You have three tools available:
- suggest_prompt_edits: For instruction changes. Use targetBlockId 'instructions-root' for top-level instruction changes, and the actual block ID for nested instructions. The content must contain exactly what should go in the instructions block, with no explanation about why it should be there (that belongs in the analysis). It is in HTML format, so make sure to preserve any HTML tags from the original instructions.
- suggest_tools: For suggesting tools to add or remove from the agent. Use the tool's sId as toolId.
- suggest_skills: For suggesting skills to add or remove from the agent. Use the skill's sId as skillId.

You MUST call at least one tool. If no improvements are needed, call suggest_prompt_edits with an empty suggestions array.`;

  const userMessage = `## Agent being analyzed
Name: ${agentConfig.name}
${descriptionSection}
${instructionsSection}

## Conversation to analyze

<conversation>
${conversationText}
</conversation>`;

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

  const batchMap = new Map<string, LLMStreamParameters>();

  for (const conversationId of conversationIds) {
    const conversationRes = await getShrinkWrappedConversation(auth, {
      conversationId,
      includeFeedback: true,
    });
    if (conversationRes.isErr()) {
      logger.warn(
        { conversationId, error: conversationRes.error },
        "ReinforcedAgent: conversation not found, skipping in batch"
      );
      continue;
    }

    const prompt = buildAnalysisPrompt(agentConfig, conversationRes.value.text);
    batchMap.set(conversationId, buildReinforcedLLMParams(prompt));
  }

  return batchMap.size > 0 ? batchMap : null;
}

/**
 * Analyze a single conversation for reinforcement suggestions.
 * Creates synthetic AgentSuggestion records.
 */
export async function analyzeConversationForReinforcement(
  auth: Authenticator,
  {
    conversationId,
    agentConfigurationId,
  }: {
    conversationId: string;
    agentConfigurationId: string;
  }
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  const [agentConfig] = await getAgentConfigurations(auth, {
    agentIds: [agentConfigurationId],
    variant: "full",
  });
  if (!agentConfig) {
    logger.warn(
      { agentConfigurationId, workspaceId: owner.sId },
      "ReinforcedAgent: agent configuration not found"
    );
    return;
  }
  if (agentConfig.id < 0) {
    return;
  }

  const conversationRes = await getShrinkWrappedConversation(auth, {
    conversationId,
    includeFeedback: true,
  });
  if (conversationRes.isErr()) {
    logger.warn(
      { conversationId, error: conversationRes.error },
      "ReinforcedAgent: conversation not found"
    );
    return;
  }

  const prompt = buildAnalysisPrompt(agentConfig, conversationRes.value.text);

  const createdCount = await runReinforcedAnalysis({
    auth,
    agentConfig,
    prompt,
    source: "synthetic",
    operationType: "reinforced_agent_analyze_conversation",
    contextId: conversationId,
  });

  if (createdCount > 0) {
    logger.info(
      {
        conversationId,
        agentConfigurationId,
        suggestionsCreated: createdCount,
      },
      "ReinforcedAgent: created synthetic suggestions from conversation analysis"
    );
  }
}
