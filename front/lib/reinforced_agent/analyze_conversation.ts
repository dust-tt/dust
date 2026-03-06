import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import { getShrinkWrapedConversation } from "@app/lib/api/assistant/conversation/shrink_wrap";
import type { Authenticator } from "@app/lib/auth";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import logger from "@app/logger/logger";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { getSmallWhitelistedModel } from "@app/types/assistant/assistant";

const ANALYZE_FUNCTION_NAME = "analyze_conversation";

function buildAnalyzeSpecifications(): AgentActionSpecification[] {
  return [
    {
      name: ANALYZE_FUNCTION_NAME,
      description:
        "Analyze a conversation and produce structured suggestions " +
        "for improving the agent configuration.",
      inputSchema: {
        type: "object",
        properties: {
          suggestions: {
            type: "array",
            description:
              "A list of concrete, actionable suggestions to improve the agent.",
            items: {
              type: "object",
              properties: {
                kind: {
                  type: "string",
                  enum: ["instructions"],
                  description: "The type of suggestion.",
                },
                content: {
                  type: "string",
                  description:
                    "The full HTML content for the instructions block.",
                },
                targetBlockId: {
                  type: "string",
                  description:
                    "The data-block-id of the block to modify. " +
                    "Use 'instructions-root' for top-level instructions.",
                },
                analysis: {
                  type: "string",
                  description:
                    "A short explanation of why this suggestion would improve the agent.",
                },
              },
              required: ["kind", "content", "targetBlockId", "analysis"],
            },
          },
        },
        required: ["suggestions"],
      },
    },
  ];
}

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

  const model = getSmallWhitelistedModel(owner);
  if (!model) {
    logger.warn(
      { workspaceId: owner.sId },
      "ReinforcedAgent: no whitelisted model available"
    );
    return;
  }

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
    // Skip global agents
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

  const res = await runMultiActionsAgent(
    auth,
    {
      providerId: model.providerId,
      modelId: model.modelId,
      functionCall: ANALYZE_FUNCTION_NAME,
      useCache: false,
    },
    {
      conversation: { messages: [] },
      prompt,
      specifications: buildAnalyzeSpecifications(),
      forceToolCall: ANALYZE_FUNCTION_NAME,
    },
    {
      context: {
        operationType: "reinforced_agent_analyze_conversation",
        conversationId,
        workspaceId: owner.sId,
      },
    }
  );

  if (res.isErr()) {
    logger.error(
      { conversationId, error: res.error },
      "ReinforcedAgent: LLM call failed"
    );
    return;
  }

  const action = res.value.actions?.[0];
  if (!action?.arguments) {
    logger.warn(
      { conversationId },
      "ReinforcedAgent: no tool call in LLM response"
    );
    return;
  }

  const { suggestions } = action.arguments as {
    suggestions: Array<{
      kind: string;
      content: string;
      targetBlockId: string;
      analysis: string;
    }>;
  };

  if (!suggestions || suggestions.length === 0) {
    logger.info(
      { conversationId, agentConfigurationId },
      "ReinforcedAgent: no suggestions from analysis"
    );
    return;
  }

  // Create synthetic suggestions.
  for (const suggestion of suggestions) {
    if (suggestion.kind !== "instructions") {
      continue;
    }

    await AgentSuggestionResource.createSuggestionForAgent(auth, agentConfig, {
      kind: "instructions",
      suggestion: {
        content: suggestion.content,
        targetBlockId: suggestion.targetBlockId,
        type: "replace",
      },
      analysis: suggestion.analysis,
      state: "pending",
      source: "synthetic",
    });
  }

  logger.info(
    {
      conversationId,
      agentConfigurationId,
      suggestionsCreated: suggestions.filter((s) => s.kind === "instructions")
        .length,
    },
    "ReinforcedAgent: created synthetic suggestions from conversation analysis"
  );
}
