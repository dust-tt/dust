import { runActionStreamed } from "@app/lib/actions/server";
import { AgentMessageContentParser } from "@app/lib/api/assistant/agent_message_content_parser";
import { renderConversationForModel } from "@app/lib/api/assistant/preprocessing";
import { getRedisClient } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { cloneBaseConfig, getDustProdAction } from "@app/lib/registry";
import logger from "@app/logger/logger";
import type {
  AgentConfigurationType,
  AgentMessageType,
  ConversationType,
  GenerationTokensEvent,
  ModelId,
  ModelIdType,
  ModelProviderIdType,
  ReasoningEffortIdType,
} from "@app/types";
import {
  CLAUDE_3_7_SONNET_20250219_MODEL_ID,
  isProviderWhitelisted,
  SUPPORTED_MODEL_CONFIGS,
} from "@app/types";

const CANCELLATION_CHECK_INTERVAL = 500;

const REASONING_GENERATION_TOKENS = 20480;

export type ReasoningConfigurationType = {
  description: string | null;
  id: ModelId;
  modelId: ModelIdType;
  name: string;
  providerId: ModelProviderIdType;
  reasoningEffort: ReasoningEffortIdType | null;
  sId: string;
  temperature: number | null;
  type: "reasoning_configuration";
};

export type ReasoningModelConfiguration = Pick<
  ReasoningConfigurationType,
  "modelId" | "providerId" | "reasoningEffort" | "temperature"
>;

/**
 * Shared function to run reasoning that can be used by both the streaming action and the MCP server.
 * It returns an async generator that yields tokens and results.
 */
export async function* runReasoning(
  auth: Authenticator,
  {
    reasoningModel,
    conversation,
    agentConfiguration,
    agentMessage,
  }: {
    reasoningModel: ReasoningModelConfiguration;
    conversation: ConversationType;
    agentConfiguration: AgentConfigurationType;
    agentMessage: AgentMessageType;
  }
): AsyncGenerator<
  | { type: "error"; message: string }
  | { type: "token"; token: GenerationTokensEvent }
  | { type: "runId"; runId: Promise<string> }
> {
  const owner = auth.getNonNullableWorkspace();

  const supportedModel = SUPPORTED_MODEL_CONFIGS.find(
    (m) =>
      m.modelId === reasoningModel.modelId &&
      m.providerId === reasoningModel.providerId
  );

  if (!supportedModel) {
    yield { type: "error", message: "Reasoning configuration not found" };
    return;
  }

  if (!isProviderWhitelisted(owner, supportedModel.providerId)) {
    yield { type: "error", message: "Provider not supported" };
    return;
  }

  if (supportedModel.featureFlag) {
    const featureFlags = await getFeatureFlags(owner);
    if (!featureFlags.includes(supportedModel.featureFlag)) {
      yield { type: "error", message: "Model not allowed." };
      return;
    }
  }

  // Render the conversation.
  const renderedConversationRes = await renderConversationForModel(auth, {
    conversation,
    model: supportedModel,
    prompt: agentConfiguration.instructions ?? "",
    tools: "",
    allowedTokenCount: supportedModel.contextSize - REASONING_GENERATION_TOKENS,
    excludeImages: true,
  });
  if (renderedConversationRes.isErr()) {
    yield {
      type: "error",
      message: `Error running reasoning action: ${renderedConversationRes.error.message}`,
    };
    return;
  }
  const renderedConversation = renderedConversationRes.value;

  // Configure the app.
  const config = cloneBaseConfig(
    getDustProdAction("assistant-v2-reason").config
  );

  config.MODEL.provider_id = supportedModel.providerId;
  config.MODEL.model_id = supportedModel.modelId;
  if (reasoningModel.temperature) {
    config.MODEL.temperature = reasoningModel.temperature;
  }
  if (reasoningModel.reasoningEffort) {
    config.MODEL.reasoning_effort = reasoningModel.reasoningEffort;
  }

  if (supportedModel.modelId === CLAUDE_3_7_SONNET_20250219_MODEL_ID) {
    // Pass some extra field: https://docs.anthropic.com/en/docs/about-claude/models/extended-thinking-models#extended-output-capabilities-beta
    config.MODEL.anthropic_beta_thinking = {
      type: "enabled",
      budget_tokens: 6400,
    };
    // Add the beta flag for larger outputs.
    config.MODEL.anthropic_beta_flags = ["output-128k-2025-02-19"];
  }

  // Run the app.
  const inputs = [
    {
      conversation: renderedConversation.modelConversation.messages,
      instructions: agentConfiguration.instructions,
    },
  ];

  const res = await runActionStreamed(
    auth,
    "assistant-v2-reason",
    config,
    inputs,
    {
      conversationId: conversation.sId,
      workspaceId: conversation.owner.sId,
      agentMessageId: agentMessage.sId,
    }
  );

  if (res.isErr()) {
    yield {
      type: "error",
      message: `Error running reasoning action: ${res.error.message}`,
    };
    return;
  }

  const { eventStream, dustRunId } = res.value;

  yield { type: "runId", runId: dustRunId };

  const contentParser = new AgentMessageContentParser(
    agentConfiguration,
    agentMessage.sId,
    supportedModel.delimitersConfiguration
  );

  const redis = await getRedisClient({ origin: "reasoning_generation" });
  let lastCheckCancellation = Date.now();

  for await (const event of eventStream) {
    if (event.type === "function_call") {
      continue;
    }
    if (event.type === "error") {
      for await (const token of contentParser.flushTokens()) {
        yield { type: "token", token };
      }
      yield {
        type: "error",
        message: `Error running reasoning action: ${event.content.message}`,
      };
      return;
    }

    const currentTimestamp = Date.now();
    if (
      currentTimestamp - lastCheckCancellation >=
      CANCELLATION_CHECK_INTERVAL
    ) {
      try {
        const cancelled = await redis.get(
          `assistant:generation:cancelled:${agentMessage.sId}`
        );
        if (cancelled === "1") {
          return;
        }
        lastCheckCancellation = currentTimestamp;
      } catch (error) {
        logger.error({ error }, "Error checking cancellation");
      }
    }

    if (event.type === "tokens") {
      for await (const token of contentParser.emitTokens(
        event.content.tokens.text
      )) {
        yield { type: "token", token };
      }
    }

    if (event.type === "block_execution") {
      const e = event.content.execution[0][0];
      if (e.error) {
        yield {
          type: "error",
          message: `Error running reasoning action: ${e.error}`,
        };
        return;
      }
    }
  }

  for await (const token of contentParser.flushTokens()) {
    yield { type: "token", token };
  }
}
