import { assertNever, INTERNAL_MIME_TYPES } from "@dust-tt/client";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { MCPProgressNotificationType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { InternalMcpServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import { runActionStreamed } from "@app/lib/actions/server";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  AgentMessageContentParser,
  getDelimitersConfiguration,
} from "@app/lib/api/assistant/agent_message_content_parser";
import { renderConversationForModel } from "@app/lib/api/assistant/conversation_rendering";
import { getRedisClient } from "@app/lib/api/redis";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { cloneBaseConfig, getDustProdAction } from "@app/lib/registry";
import logger from "@app/logger/logger";
import type {
  AgentConfigurationType,
  AgentMessageType,
  ConversationType,
  GenerationTokensEvent,
  ReasoningModelConfigurationType,
} from "@app/types";
import {
  Err,
  isModelId,
  isModelProviderId,
  isProviderWhitelisted,
  isReasoningEffortId,
  Ok,
} from "@app/types";

const CANCELLATION_CHECK_INTERVAL = 500;
const REASONING_GENERATION_TOKENS = 20480;

const serverName = "reasoning";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): InternalMcpServer<typeof serverName> {
  const server = makeInternalMCPServer(serverName);

  server.tool(
    "advanced_reasoning",
    "Offload a reasoning-heavy task to a powerful reasoning model. The reasoning model does not have access to any tools.",
    {
      model:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.REASONING_MODEL
        ],
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "advanced_reasoning", agentLoopContext },
      async (
        { model: { modelId, providerId, temperature, reasoningEffort } },
        { sendNotification, _meta }
      ) => {
        if (!agentLoopContext?.runContext) {
          throw new Error("Unreachable: missing agentLoopRunContext.");
        }

        const agentLoopRunContext = agentLoopContext.runContext;

        if (
          !isModelId(modelId) ||
          !isModelProviderId(providerId) ||
          (reasoningEffort !== null && !isReasoningEffortId(reasoningEffort))
        ) {
          return new Err(new MCPError("Invalid model ID."));
        }

        const actionOutput = {
          content: "",
          thinking: "",
        };

        const { conversation, agentConfiguration, agentMessage } =
          agentLoopRunContext;

        for await (const event of runReasoning(auth, {
          reasoningModel: { modelId, providerId, temperature, reasoningEffort },
          conversation,
          agentConfiguration,
          agentMessage,
        })) {
          switch (event.type) {
            case "error": {
              return new Err(new MCPError(event.message));
            }
            case "token": {
              const { classification, text } = event.token;
              if (
                classification === "opening_delimiter" ||
                classification === "closing_delimiter"
              ) {
                continue;
              }
              if (classification === "chain_of_thought") {
                actionOutput.thinking += text;
              } else {
                actionOutput.content += text;
              }

              if (_meta?.progressToken) {
                const notification: MCPProgressNotificationType = {
                  method: "notifications/progress",
                  params: {
                    progress: 0,
                    total: 1,
                    progressToken: _meta?.progressToken,
                    data: {
                      label: "Thinking...",
                      output: {
                        type: "text",
                        text,
                      },
                    },
                  },
                };

                await sendNotification(notification);
              }

              break;
            }
            case "runId":
              break;
            default:
              assertNever(event);
          }
        }

        return new Ok([
          {
            type: "resource",
            resource: {
              text: actionOutput.thinking,
              mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.THINKING,
              uri: "",
            },
          },
          {
            type: "resource",
            resource: {
              text: actionOutput.content,
              mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.REASONING_SUCCESS,
              uri: "",
            },
          },
        ]);
      }
    )
  );

  return server;
}

async function* runReasoning(
  auth: Authenticator,
  {
    reasoningModel,
    conversation,
    agentConfiguration,
    agentMessage,
  }: {
    reasoningModel: ReasoningModelConfigurationType;
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

  const supportedModel = getSupportedModelConfig(reasoningModel);

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
    onMissingAction: "skip",
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

  const reasoningEffort =
    reasoningModel.reasoningEffort ?? supportedModel.defaultReasoningEffort;

  if (
    reasoningEffort !== "none" &&
    (reasoningEffort !== "light" || supportedModel.useNativeLightReasoning)
  ) {
    config.MODEL.reasoning_effort = reasoningEffort;
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
    getDelimitersConfiguration({ agentConfiguration })
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

export default createServer;
