import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { AGENT_SIDEKICK_CONTEXT_TOOLS_METADATA } from "@app/lib/api/actions/servers/agent_sidekick_context/metadata";
import {
  createInstructionSuggestions,
  createSkillsSuggestions,
  createToolsSuggestions,
} from "@app/lib/api/actions/servers/agent_sidekick_context/tools";
import { getLLM } from "@app/lib/api/llm";
import type { LLM } from "@app/lib/api/llm/llm";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type { LLMStreamParameters } from "@app/lib/api/llm/types/options";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import { getSmallWhitelistedModel } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { AgentSuggestionSource } from "@app/types/suggestions/agent_suggestion";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const SUPPORTED_TOOLS = [
  "suggest_prompt_edits",
  "suggest_tools",
  "suggest_skills",
] as const;

type SupportedToolName = (typeof SUPPORTED_TOOLS)[number];

const TOOL_SCHEMAS: Record<SupportedToolName, z.ZodObject<z.ZodRawShape>> = {
  suggest_prompt_edits: z.object(
    AGENT_SIDEKICK_CONTEXT_TOOLS_METADATA.suggest_prompt_edits.schema
  ),
  suggest_tools: z.object(
    AGENT_SIDEKICK_CONTEXT_TOOLS_METADATA.suggest_tools.schema
  ),
  suggest_skills: z.object(
    AGENT_SIDEKICK_CONTEXT_TOOLS_METADATA.suggest_skills.schema
  ),
};

function buildSpecifications(): AgentActionSpecification[] {
  return SUPPORTED_TOOLS.map((toolName) => ({
    name: AGENT_SIDEKICK_CONTEXT_TOOLS_METADATA[toolName].name,
    description: AGENT_SIDEKICK_CONTEXT_TOOLS_METADATA[toolName].description,
    inputSchema: zodToJsonSchema(TOOL_SCHEMAS[toolName]) as JSONSchema,
  }));
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
  const model = await getSmallWhitelistedModel(auth);
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
 * Handles multiple tool calls across suggest_prompt_edits, suggest_tools,
 * and suggest_skills.
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

  const supportedToolNames = new Set<string>(SUPPORTED_TOOLS);
  const toolCallEvents = events.filter(
    (e) => e.type === "tool_call" && supportedToolNames.has(e.content.name)
  );
  if (toolCallEvents.length === 0) {
    logger.warn(
      { contextId },
      `ReinforcedAgent: no tool call in batch result for ${operationType}`
    );
    return 0;
  }

  let totalCreated = 0;
  for (const event of toolCallEvents) {
    if (event.type !== "tool_call") {
      continue;
    }
    totalCreated += await createSuggestionsFromToolCall({
      auth,
      agentConfig,
      toolName: event.content.name,
      actionArguments: event.content.arguments,
      source,
      operationType,
      contextId,
    });
  }

  return totalCreated;
}

/**
 * Dispatch a tool call to the appropriate suggestion creation function.
 */
async function createSuggestionsFromToolCall({
  auth,
  agentConfig,
  toolName,
  actionArguments,
  source,
  operationType,
  contextId,
}: {
  auth: Authenticator;
  agentConfig: LightAgentConfigurationType;
  toolName: string;
  actionArguments: Record<string, unknown>;
  source: AgentSuggestionSource;
  operationType: ReinforcedOperationType;
  contextId: string;
}): Promise<number> {
  switch (toolName) {
    case "suggest_prompt_edits": {
      const parsed =
        TOOL_SCHEMAS.suggest_prompt_edits.safeParse(actionArguments);
      if (!parsed.success) {
        logger.warn(
          {
            agentConfigurationId: agentConfig.sId,
            contextId,
            toolName,
            error: parsed.error,
          },
          `ReinforcedAgent: invalid LLM response shape for ${operationType}`
        );
        return 0;
      }
      const result = await createInstructionSuggestions({
        auth,
        agentConfigurationId: agentConfig.sId,
        suggestions: parsed.data.suggestions,
        source,
      });
      if (result.isErr()) {
        logger.warn(
          { agentConfigurationId: agentConfig.sId, contextId, toolName },
          `ReinforcedAgent: ${result.error}`
        );
        return 0;
      }
      return result.value.length;
    }

    case "suggest_tools": {
      const parsed = TOOL_SCHEMAS.suggest_tools.safeParse(actionArguments);
      if (!parsed.success) {
        logger.warn(
          {
            agentConfigurationId: agentConfig.sId,
            contextId,
            toolName,
            error: parsed.error,
          },
          `ReinforcedAgent: invalid LLM response shape for ${operationType}`
        );
        return 0;
      }
      const result = await createToolsSuggestions({
        auth,
        agentConfigurationId: agentConfig.sId,
        suggestions: parsed.data.suggestions,
        source,
      });
      if (result.isErr()) {
        logger.warn(
          { agentConfigurationId: agentConfig.sId, contextId, toolName },
          `ReinforcedAgent: ${result.error}`
        );
        return 0;
      }
      return result.value.length;
    }

    case "suggest_skills": {
      const parsed = TOOL_SCHEMAS.suggest_skills.safeParse(actionArguments);
      if (!parsed.success) {
        logger.warn(
          {
            agentConfigurationId: agentConfig.sId,
            contextId,
            toolName,
            error: parsed.error,
          },
          `ReinforcedAgent: invalid LLM response shape for ${operationType}`
        );
        return 0;
      }
      const result = await createSkillsSuggestions({
        auth,
        agentConfigurationId: agentConfig.sId,
        suggestions: parsed.data.suggestions,
        source,
      });
      if (result.isErr()) {
        logger.warn(
          { agentConfigurationId: agentConfig.sId, contextId, toolName },
          `ReinforcedAgent: ${result.error}`
        );
        return 0;
      }
      return result.value.length;
    }

    default:
      logger.warn(
        { agentConfigurationId: agentConfig.sId, contextId, toolName },
        `ReinforcedAgent: unexpected tool name for ${operationType}`
      );
      return 0;
  }
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
