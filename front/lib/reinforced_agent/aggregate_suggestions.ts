import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import logger from "@app/logger/logger";
import { getFastestWhitelistedModel } from "@app/types/assistant/assistant";

const AGGREGATE_FUNCTION_NAME = "aggregate_suggestions";

function buildAggregateSpecifications(): AgentActionSpecification[] {
  return [
    {
      name: AGGREGATE_FUNCTION_NAME,
      description:
        "Aggregate and deduplicate synthetic suggestions into " +
        "user-facing pending suggestions.",
      inputSchema: {
        type: "object",
        properties: {
          suggestions: {
            type: "array",
            description:
              "Deduplicated, prioritized suggestions for the agent. " +
              "Combine similar suggestions, keep the strongest ones.",
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
                  description: "The data-block-id of the block to modify.",
                },
                analysis: {
                  type: "string",
                  description:
                    "A concise explanation of why this suggestion was made, " +
                    "mentioning how many conversations support it.",
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

function buildAggregationPrompt(
  agentName: string,
  syntheticSuggestions: Array<{
    kind: string;
    analysis: string | null;
    content: string;
    targetBlockId: string;
  }>
): string {
  const suggestionsSection = syntheticSuggestions
    .map(
      (s, i) => `### Suggestion ${i + 1}
kind: ${s.kind}
targetBlockId: ${s.targetBlockId}
analysis: ${s.analysis ?? "N/A"}
content: ${s.content}`
    )
    .join("\n\n");

  return `You are an AI agent improvement analyst. You have been given multiple suggestions from individual conversation analyses for the same agent. Your job is to deduplicate, merge, and prioritize them into a concise set of high-quality, actionable suggestions.

## Agent: ${agentName}

## Synthetic suggestions from conversation analyses

${suggestionsSection}

## Your task
- Merge suggestions that address the same issue, or that target the same block. You can never have more than one suggestion targeting the same block.
- Remove duplicates
- Keep only the most impactful suggestions (max 5)
- In the analysis, mention how many conversations support each suggestion

You MUST call the tool. If no suggestions survive aggregation, return an empty suggestions array.`;
}

/**
 * Aggregate synthetic suggestions for an agent into pending suggestions.
 * Marks processed synthetic suggestions as outdated.
 */
export async function aggregateSyntheticSuggestions(
  auth: Authenticator,
  agentConfigurationId: string
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  // Fetch all synthetic suggestions for this agent.
  const syntheticSuggestions =
    await AgentSuggestionResource.listByAgentConfigurationId(
      auth,
      agentConfigurationId,
      { sources: ["synthetic"], states: ["pending"] }
    );

  if (syntheticSuggestions.length === 0) {
    return;
  }

  const model = getFastestWhitelistedModel(owner);
  if (!model) {
    logger.warn(
      { workspaceId: owner.sId },
      "ReinforcedAgent: no whitelisted model for aggregation"
    );
    return;
  }

  // Fetch agent configuration for context.
  const [agentConfig] = await getAgentConfigurations(auth, {
    agentIds: [agentConfigurationId],
    variant: "light",
  });
  if (!agentConfig) {
    logger.warn(
      { agentConfigurationId },
      "ReinforcedAgent: agent not found for aggregation"
    );
    return;
  }

  // Prepare synthetic suggestions for the prompt.
  const suggestionsForPrompt = syntheticSuggestions.map((s) => {
    const json = s.toJSON();
    return {
      kind: json.kind,
      analysis: json.analysis,
      content:
        json.kind === "instructions"
          ? (json.suggestion as { content: string }).content
          : "",
      targetBlockId:
        json.kind === "instructions"
          ? (json.suggestion as { targetBlockId: string }).targetBlockId
          : "instructions-root",
    };
  });

  const prompt = buildAggregationPrompt(agentConfig.name, suggestionsForPrompt);

  // Use the LLM to aggregate — we pass an empty conversation since
  // the prompt contains all the context.
  const res = await runMultiActionsAgent(
    auth,
    {
      providerId: model.providerId,
      modelId: model.modelId,
      functionCall: AGGREGATE_FUNCTION_NAME,
      useCache: false,
    },
    {
      conversation: { messages: [] },
      prompt,
      specifications: buildAggregateSpecifications(),
      forceToolCall: AGGREGATE_FUNCTION_NAME,
    },
    {
      context: {
        operationType: "reinforced_agent_aggregate_suggestions",
        conversationId: "n/a",
        workspaceId: owner.sId,
      },
    }
  );

  if (res.isErr()) {
    logger.error(
      { agentConfigurationId, error: res.error },
      "ReinforcedAgent: LLM aggregation call failed"
    );
    return;
  }

  const action = res.value.actions?.[0];
  if (!action?.arguments) {
    logger.warn(
      { agentConfigurationId },
      "ReinforcedAgent: no tool call in aggregation response"
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

  // Create pending suggestions.
  let createdCount = 0;
  for (const suggestion of suggestions ?? []) {
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
      source: "reinforcement",
    });
    createdCount++;
  }

  // Mark all synthetic suggestions as approved (consumed by aggregation).
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
