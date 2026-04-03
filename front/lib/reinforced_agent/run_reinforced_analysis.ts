import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { AGENT_SIDEKICK_CONTEXT_TOOLS_METADATA } from "@app/lib/api/actions/servers/agent_sidekick_context/metadata";
import {
  createInstructionSuggestions,
  createSkillsSuggestions,
  createToolsSuggestions,
} from "@app/lib/api/actions/servers/agent_sidekick_context/tools";
import { getLLM } from "@app/lib/api/llm";
import { writeBatchUserMessages } from "@app/lib/api/llm/batch_llm";
import type { LLM } from "@app/lib/api/llm/llm";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type { LLMStreamParameters } from "@app/lib/api/llm/types/options";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import { getLargeWhitelistedModel } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import {
  ALL_TOOLS,
  type ExploratoryToolCallInfo,
  getReinforcementMetadata,
  isExploratoryToolName,
  isTerminalToolName,
  type ProcessReinforcedEventsResult,
  type ReinforcedOperationType,
  type TerminalToolCallEvent,
  type TerminalToolCallFailure,
  type TerminalToolCallInfo,
  type TerminalToolCallSuccess,
  TOOL_SCHEMAS,
} from "@app/lib/reinforced_agent/types";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { AgentSuggestionSource } from "@app/types/suggestions/agent_suggestion";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const REINFORCEMENT_AGENT_ID = "reinforcement";

export function buildReinforcedSpecifications(): AgentActionSpecification[] {
  return ALL_TOOLS.map((toolName) => {
    const meta = AGENT_SIDEKICK_CONTEXT_TOOLS_METADATA[toolName];
    const schema = z.object(meta.schema);
    return {
      name: meta.name,
      description: meta.description,
      inputSchema: zodToJsonSchema(schema) as JSONSchema,
    };
  });
}

interface CategorizedToolCalls {
  exploratoryToolCalls: ExploratoryToolCallInfo[];
  terminalToolCalls: TerminalToolCallInfo[];
}

export function classifyToolCalls(events: LLMEvent[]): CategorizedToolCalls {
  const exploratoryToolCalls: ExploratoryToolCallInfo[] = [];
  const terminalToolCalls: TerminalToolCallInfo[] = [];

  for (const e of events) {
    if (e.type !== "tool_call") {
      continue;
    }
    const { id, name, arguments: args } = e.content;
    if (isExploratoryToolName(name)) {
      exploratoryToolCalls.push({ id, name, arguments: args });
    } else if (isTerminalToolName(name)) {
      terminalToolCalls.push({ id, name, arguments: args });
    } else {
      logger.warn(
        { toolCallId: id, toolName: name },
        "ReinforcedAgent: received tool call with unrecognized name"
      );
    }
  }

  return { exploratoryToolCalls, terminalToolCalls };
}

export function getReinforcementDefaultOptions(
  reinforcedOperationType: ReinforcedOperationType,
  reinforcedAgentConfigurationId: string
) {
  return {
    visibility: "test" as const,
    metadata: getReinforcementMetadata(
      reinforcedOperationType,
      reinforcedAgentConfigurationId
    ),
    userContextUsername: "reinforced_agent",
    userContextOrigin: "reinforcement" as const,
    agentConfigurationId: REINFORCEMENT_AGENT_ID,
  };
}

/**
 * Generate a human-readable title for a reinforcement conversation based on
 * the operation type and context (e.g. the analysed conversation sId).
 */
export function reinforcementConversationTitle(
  operationType: ReinforcedOperationType,
  contextId: string
): string {
  switch (operationType) {
    case "reinforced_agent_analyze_conversation":
      return `Reinforced agent analysis of ${contextId}`;
    case "reinforced_agent_aggregate_suggestions":
      return `Reinforced agent aggregation for ${contextId}`;
    default:
      assertNever(operationType);
  }
}

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
    specifications: buildReinforcedSpecifications(),
  };
}

/**
 * Create a reinforcement conversation with the initial user message.
 * Returns the conversation sId.
 */
export async function createReinforcementConversation(
  auth: Authenticator,
  {
    prompt,
    operationType,
    contextId,
    agentConfigurationId,
  }: {
    prompt: { systemPrompt: string; userMessage: string };
    operationType: ReinforcedOperationType;
    contextId: string;
    agentConfigurationId: string;
  }
): Promise<string> {
  const llmParams = buildReinforcedLLMParams(prompt);
  const { conversation: llmConversation, ...llmParamsWithoutConversation } =
    llmParams;
  const writeResult = await writeBatchUserMessages(auth, {
    newMessages: llmConversation.messages,
    title: reinforcementConversationTitle(operationType, contextId),
    ...llmParamsWithoutConversation,
    ...getReinforcementDefaultOptions(operationType, agentConfigurationId),
  });
  if (writeResult.isErr()) {
    throw writeResult.error;
  }
  return writeResult.value.sId;
}

/**
 * Get the LLM instance configured for reinforced agent analysis.
 */
export async function getReinforcedLLM(
  auth: Authenticator,
  operationType: ReinforcedOperationType
): Promise<LLM | null> {
  const owner = auth.workspace();
  if (!owner) {
    return null;
  }
  const model = getLargeWhitelistedModel(auth);
  if (!model) {
    return null;
  }
  const credentials = await getLlmCredentials(auth, {
    skipEmbeddingApiKeyRequirement: true,
  });
  return getLLM(auth, {
    modelId: model.modelId,
    credentials,
    context: {
      operationType,
      workspaceId: owner.sId,
      userId: auth.user()?.sId,
    },
  });
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
  conversation,
}: {
  auth: Authenticator;
  agentConfig: LightAgentConfigurationType;
  events: LLMEvent[];
  source: AgentSuggestionSource;
  operationType: ReinforcedOperationType;
  contextId: string;
  conversation?: ConversationResource;
}): Promise<ProcessReinforcedEventsResult> {
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
    return {
      suggestionsCreated: 0,
      successfulToolCalls: [],
      failedToolCalls: [],
    };
  }

  const toolCallEvents = events.filter(
    (e): e is TerminalToolCallEvent =>
      e.type === "tool_call" && isTerminalToolName(e.content.name)
  );
  if (toolCallEvents.length === 0) {
    logger.warn(
      { contextId },
      `ReinforcedAgent: no tool call in batch result for ${operationType}`
    );
    return {
      suggestionsCreated: 0,
      successfulToolCalls: [],
      failedToolCalls: [],
    };
  }

  let totalCreated = 0;
  const successfulToolCalls: TerminalToolCallSuccess[] = [];
  const failedToolCalls: TerminalToolCallFailure[] = [];

  for (const event of toolCallEvents) {
    const { id, name, arguments: args } = event.content;
    const toolCall: TerminalToolCallInfo = { id, name, arguments: args };
    const result = await createSuggestionsFromToolCall({
      auth,
      agentConfig,
      toolName: event.content.name,
      actionArguments: event.content.arguments,
      source,
      operationType,
      contextId,
      conversation,
    });
    totalCreated += result.suggestionsCreated;
    if (result.error) {
      failedToolCalls.push({ toolCall, errorMessage: result.error });
    } else {
      successfulToolCalls.push({
        toolCall,
        message: `Successfully created ${result.suggestionsCreated} suggestion(s).`,
      });
    }
  }

  return {
    suggestionsCreated: totalCreated,
    successfulToolCalls,
    failedToolCalls,
  };
}

interface ToolCallResult {
  suggestionsCreated: number;
  error?: string;
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
  conversation,
}: {
  auth: Authenticator;
  agentConfig: LightAgentConfigurationType;
  toolName: string;
  actionArguments: Record<string, unknown>;
  source: AgentSuggestionSource;
  operationType: ReinforcedOperationType;
  contextId: string;
  conversation?: ConversationResource;
}): Promise<ToolCallResult> {
  switch (toolName) {
    case "suggest_prompt_edits": {
      const parsed =
        TOOL_SCHEMAS.suggest_prompt_edits.safeParse(actionArguments);
      if (!parsed.success) {
        const errorMessage = `Invalid arguments for ${toolName}: ${parsed.error.message}`;
        logger.warn(
          {
            agentConfigurationId: agentConfig.sId,
            contextId,
            toolName,
            error: parsed.error,
          },
          `ReinforcedAgent: invalid LLM response shape for ${operationType}`
        );
        return { suggestionsCreated: 0, error: errorMessage };
      }
      const result = await createInstructionSuggestions({
        auth,
        agentConfigurationId: agentConfig.sId,
        suggestions: parsed.data.suggestions,
        source,
        conversation,
      });
      if (result.isErr()) {
        logger.warn(
          { agentConfigurationId: agentConfig.sId, contextId, toolName },
          `ReinforcedAgent: ${result.error}`
        );
        return {
          suggestionsCreated: 0,
          error: `Error creating suggestions: ${result.error}`,
        };
      }
      return { suggestionsCreated: result.value.length };
    }

    case "suggest_tools": {
      const parsed = TOOL_SCHEMAS.suggest_tools.safeParse(actionArguments);
      if (!parsed.success) {
        const errorMessage = `Invalid arguments for ${toolName}: ${parsed.error.message}`;
        logger.warn(
          {
            agentConfigurationId: agentConfig.sId,
            contextId,
            toolName,
            error: parsed.error,
          },
          `ReinforcedAgent: invalid LLM response shape for ${operationType}`
        );
        return { suggestionsCreated: 0, error: errorMessage };
      }
      const result = await createToolsSuggestions({
        auth,
        agentConfigurationId: agentConfig.sId,
        suggestions: parsed.data.suggestions,
        source,
        conversation,
      });
      if (result.isErr()) {
        logger.warn(
          { agentConfigurationId: agentConfig.sId, contextId, toolName },
          `ReinforcedAgent: ${result.error}`
        );
        return {
          suggestionsCreated: 0,
          error: `Error creating suggestions: ${result.error}`,
        };
      }
      return { suggestionsCreated: result.value.length };
    }

    case "suggest_skills": {
      const parsed = TOOL_SCHEMAS.suggest_skills.safeParse(actionArguments);
      if (!parsed.success) {
        const errorMessage = `Invalid arguments for ${toolName}: ${parsed.error.message}`;
        logger.warn(
          {
            agentConfigurationId: agentConfig.sId,
            contextId,
            toolName,
            error: parsed.error,
          },
          `ReinforcedAgent: invalid LLM response shape for ${operationType}`
        );
        return { suggestionsCreated: 0, error: errorMessage };
      }
      const result = await createSkillsSuggestions({
        auth,
        agentConfigurationId: agentConfig.sId,
        suggestions: parsed.data.suggestions,
        source,
        conversation,
      });
      if (result.isErr()) {
        logger.warn(
          { agentConfigurationId: agentConfig.sId, contextId, toolName },
          `ReinforcedAgent: ${result.error}`
        );
        return {
          suggestionsCreated: 0,
          error: `Error creating suggestions: ${result.error}`,
        };
      }
      return { suggestionsCreated: result.value.length };
    }

    default:
      logger.warn(
        { agentConfigurationId: agentConfig.sId, contextId, toolName },
        `ReinforcedAgent: unexpected tool name for ${operationType}`
      );
      return { suggestionsCreated: 0 };
  }
}
