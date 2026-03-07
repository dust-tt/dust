import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import type { Authenticator } from "@app/lib/auth";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import logger from "@app/logger/logger";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { getSmallWhitelistedModel } from "@app/types/assistant/assistant";
import type { AgentSuggestionSource } from "@app/types/suggestions/agent_suggestion";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import { z } from "zod";

const ReinforcedSuggestionSchema = z.object({
  kind: z.string(),
  content: z.string(),
  targetBlockId: z.string(),
  analysis: z.string(),
});

const ReinforcedResponseSchema = z.object({
  suggestions: z.array(ReinforcedSuggestionSchema),
});

const FUNCTION_NAME = "add_suggestions";

function buildSpecifications(): AgentActionSpecification[] {
  return [
    {
      name: FUNCTION_NAME,
      description: "Add structured suggestions that improve the agent.",
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

type ReinforcedOperationType =
  | "reinforced_agent_analyze_conversation"
  | "reinforced_agent_aggregate_suggestions";

/**
 * Shared helper for both analyze and aggregate phases of reinforced agents.
 * Calls the LLM with the given prompt, parses suggestions, and creates them.
 * Returns the number of suggestions created.
 */
export async function runReinforcedAnalysis({
  auth,
  agentConfig,
  prompt,
  source,
  operationType,
  contextId,
}: {
  auth: Authenticator;
  agentConfig: LightAgentConfigurationType;
  prompt: string;
  source: AgentSuggestionSource;
  operationType: ReinforcedOperationType;
  contextId: string;
}): Promise<number> {
  const owner = auth.getNonNullableWorkspace();

  const model = getSmallWhitelistedModel(owner);
  if (!model) {
    logger.warn(
      { workspaceId: owner.sId },
      `ReinforcedAgent: no whitelisted model available for ${operationType}`
    );
    return 0;
  }

  const res = await runMultiActionsAgent(
    auth,
    {
      providerId: model.providerId,
      modelId: model.modelId,
      functionCall: FUNCTION_NAME,
      useCache: false,
    },
    {
      conversation: { messages: [] },
      prompt,
      specifications: buildSpecifications(),
      forceToolCall: FUNCTION_NAME,
    },
    {
      context: {
        operationType,
        conversationId: contextId,
        workspaceId: owner.sId,
      },
    }
  );

  if (res.isErr()) {
    logger.error(
      { contextId, error: res.error },
      `ReinforcedAgent: LLM call failed for ${operationType}`
    );
    return 0;
  }

  const action = res.value.actions?.[0];
  if (!action?.arguments) {
    logger.warn(
      { contextId },
      `ReinforcedAgent: no tool call in LLM response for ${operationType}`
    );
    return 0;
  }

  const parsed = ReinforcedResponseSchema.safeParse(action.arguments);
  if (!parsed.success) {
    logger.warn(
      {
        agentConfigurationId: agentConfig.sId,
        contextId,
        error: parsed.error,
      },
      `ReinforcedAgent: invalid LLM response shape for ${operationType}`
    );
    return 0;
  }

  const { suggestions } = parsed.data;

  let createdCount = 0;
  for (const suggestion of suggestions) {
    if (suggestion.kind !== "instructions") {
      continue;
    }

    await AgentSuggestionResource.createSuggestionForAgent(auth, agentConfig, {
      kind: "instructions",
      suggestion: {
        content: suggestion.content,
        targetBlockId:
          suggestion.targetBlockId || INSTRUCTIONS_ROOT_TARGET_BLOCK_ID,
        type: "replace",
      },
      analysis: suggestion.analysis,
      state: "pending",
      source,
    });
    createdCount++;
  }

  return createdCount;
}
