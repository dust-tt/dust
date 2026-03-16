import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { getLLM } from "@app/lib/api/llm";
import type { LLM } from "@app/lib/api/llm/llm";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type { LLMStreamParameters } from "@app/lib/api/llm/types/options";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import type { Authenticator } from "@app/lib/auth";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import logger from "@app/logger/logger";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { getSmallWhitelistedModel } from "@app/types/assistant/assistant";
import { normalizeError } from "@app/types/shared/utils/error_utils";
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
 * Build LLMStreamParameters for a reinforced analysis prompt.
 * Used to create batch entries or for direct streaming.
 */
export function buildReinforcedLLMParams({
  systemPrompt,
  userMessage,
}: {
  systemPrompt: string;
  userMessage: string;
}): LLMStreamParameters {
  return {
    conversation: {
      messages: [
        {
          role: "user",
          name: "user",
          content: [{ type: "text", text: userMessage }],
        },
      ],
    },
    prompt: systemPrompt,
    specifications: buildSpecifications(),
    forceToolCall: FUNCTION_NAME,
  };
}

/**
 * Get the LLM instance configured for reinforced agent analysis.
 */
export async function getReinforcedLLM(
  auth: Authenticator
): Promise<LLM | null> {
  const owner = auth.workspace();
  if (!owner) {
    return null;
  }
  const model = getSmallWhitelistedModel(owner);
  if (!model) {
    return null;
  }
  const credentials = await getLlmCredentials(auth, {
    skipEmbeddingApiKeyRequirement: true,
  });
  return getLLM(auth, { modelId: model.modelId, credentials });
}

/**
 * Parse tool calls from LLM events and create suggestion records.
 * Used to process batch results.
 */
export async function processReinforcedEvents({
  auth,
  agentConfig,
  events,
  source,
  operationType,
  contextId,
}: {
  auth: Authenticator;
  agentConfig: LightAgentConfigurationType;
  events: LLMEvent[];
  source: AgentSuggestionSource;
  operationType: ReinforcedOperationType;
  contextId: string;
}): Promise<number> {
  const errorEvents = events.filter((e) => e.type === "error");
  if (errorEvents.length > 0) {
    logger.error(
      {
        contextId,
        errorCount: errorEvents.length,
        errors: errorEvents.map((e) => normalizeError(e)),
      },
      `ReinforcedAgent: batch LLM errors for ${operationType}`
    );
    return 0;
  }

  const toolCallEvent = events.find(
    (e) => e.type === "tool_call" && e.content.name === FUNCTION_NAME
  );
  if (!toolCallEvent || toolCallEvent.type !== "tool_call") {
    logger.warn(
      { contextId },
      `ReinforcedAgent: no tool call in batch result for ${operationType}`
    );
    return 0;
  }

  return createSuggestionsFromToolCall({
    auth,
    agentConfig,
    actionArguments: toolCallEvent.content.arguments,
    source,
    operationType,
    contextId,
  });
}

/**
 * Shared helper: parse action arguments and create suggestion records.
 */
async function createSuggestionsFromToolCall({
  auth,
  agentConfig,
  actionArguments,
  source,
  operationType,
  contextId,
}: {
  auth: Authenticator;
  agentConfig: LightAgentConfigurationType;
  actionArguments: Record<string, unknown>;
  source: AgentSuggestionSource;
  operationType: ReinforcedOperationType;
  contextId: string;
}): Promise<number> {
  const parsed = ReinforcedResponseSchema.safeParse(actionArguments);
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
  prompt: { systemPrompt: string; userMessage: string };
  source: AgentSuggestionSource;
  operationType: ReinforcedOperationType;
  contextId: string;
}): Promise<number> {
  const llm = await getReinforcedLLM(auth);
  if (!llm) {
    logger.error(
      { contextId },
      `ReinforcedAgent: no whitelisted model available for ${operationType}`
    );
    return 0;
  }

  const events: LLMEvent[] = [];
  for await (const event of llm.stream(buildReinforcedLLMParams(prompt))) {
    events.push(event);
  }

  return processReinforcedEvents({
    auth,
    agentConfig,
    events,
    source,
    operationType,
    contextId,
  });
}
