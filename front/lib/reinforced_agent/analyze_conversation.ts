import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import { getShrinkWrapedConversation } from "@app/lib/api/assistant/conversation/shrink_wrap";
import type { Authenticator } from "@app/lib/auth";
import { runReinforcedAnalysis } from "@app/lib/reinforced_agent/run_reinforced_analysis";
import logger from "@app/logger/logger";
import type { AgentConfigurationType } from "@app/types/assistant/agent";

function buildAnalysisPrompt(
  agentConfig: AgentConfigurationType,
  conversationText: string
): string {
  const descriptionSection = agentConfig.description
    ? `Description: ${agentConfig.description}`
    : "";
  const instructionsSection = agentConfig.instructionsHtml
    ? `\n### Current instructions\n${agentConfig.instructionsHtml}`
    : "";

  return `You are an AI agent improvement analyst. Your job is to analyze a conversation handled by an AI agent and suggest concrete improvements to the agent's configuration.

## Agent being analyzed
Name: ${agentConfig.name}
${descriptionSection}
${instructionsSection}

## Conversation to analyze

<conversation>
${conversationText}
</conversation>

## Your task
Analyze the conversation and identify areas where the agent's instructions could be improved. Focus on:
- Cases where the agent misunderstood the user's intent
- Missing knowledge or capabilities the agent should have
- Tone or style improvements based on user reactions
- Specific instructions that could prevent repeated mistakes

Only suggest changes to the instructions (kind: 'instructions'). Use targetBlockId 'instructions-root' for top-level instruction changes,
and the actual block ID for nested instructions.

The content must contain exactly what should go in the instructions block, with no explanation about why it should be there (that belongs in the analysis).
It is in HTML format, so make sure to preserve any HTML tags from the original instructions.

You MUST call the tool. Always call it. If no improvements are needed, return an empty suggestions array.`;
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

  // Fetch agent configuration.
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
    // Skip global agents.
    return;
  }

  // Get shrink-wrapped conversation text.
  const conversationRes = await getShrinkWrapedConversation(auth, {
    conversationId,
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
