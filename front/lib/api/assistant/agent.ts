import type { MCPToolConfigurationType } from "@app/lib/actions/mcp";
import {
  TOOL_NAME_SEPARATOR,
  tryListMCPTools,
} from "@app/lib/actions/mcp_actions";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { getRunnerForActionConfiguration } from "@app/lib/actions/runners";
import {
  isDustAppChatBlockType,
  runActionStreamed,
} from "@app/lib/actions/server";
import type {
  ActionConfigurationType,
  AgentActionConfigurationType,
  AgentActionSpecification,
} from "@app/lib/actions/types/agent";
import { isActionConfigurationType } from "@app/lib/actions/types/agent";
import { isMCPToolConfiguration } from "@app/lib/actions/types/guards";
import { getCitationsCount } from "@app/lib/actions/utils";
import { createClientSideMCPServerConfigurations } from "@app/lib/api/actions/mcp_client_side";
import { categorizeAgentErrorMessage } from "@app/lib/api/assistant/agent_errors";
import {
  AgentMessageContentParser,
  getDelimitersConfiguration,
} from "@app/lib/api/assistant/agent_message_content_parser";
import {
  getAgentConfiguration,
  getAgentConfigurations,
} from "@app/lib/api/assistant/configuration";
import { ensureConversationTitle } from "@app/lib/api/assistant/conversation/title";
import { constructPromptMultiActions } from "@app/lib/api/assistant/generation";
import { getJITServers } from "@app/lib/api/assistant/jit_actions";
import { listAttachments } from "@app/lib/api/assistant/jit_utils";
import { isLegacyAgentConfiguration } from "@app/lib/api/assistant/legacy_agent";
import { renderConversationForModel } from "@app/lib/api/assistant/preprocessing";
import { publishConversationRelatedEvent } from "@app/lib/api/assistant/streaming/events";
import type { AgentMessageEvents } from "@app/lib/api/assistant/streaming/types";
import config from "@app/lib/api/config";
import { getRedisClient } from "@app/lib/api/redis";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import type { AgentMessage } from "@app/lib/models/assistant/conversation";
import { cloneBaseConfig, getDustProdAction } from "@app/lib/registry";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { wakeLock } from "@app/lib/wake_lock";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";
import { launchUpdateUsageWorkflow } from "@app/temporal/usage_queue/client";
import type {
  AgentActionsEvent,
  AgentConfigurationType,
  AgentMessageType,
  ConversationType,
  GenerationTokensEvent,
  LightAgentConfigurationType,
  ModelId,
  UserMessageType,
  WorkspaceType,
} from "@app/types";
import { assertNever, removeNulls } from "@app/types";
import type {
  FunctionCallContentType,
  ReasoningContentType,
  TextContentType,
} from "@app/types/assistant/agent_message_content";

const CANCELLATION_CHECK_INTERVAL = 500;
const MAX_ACTIONS_PER_STEP = 16;
const MAX_AUTO_RETRY = 3;

// Process database operations for agent events before publishing to Redis.
async function processEventForDatabase(
  event: AgentMessageEvents,
  agentMessageRow: AgentMessage
): Promise<void> {
  switch (event.type) {
    case "agent_error":
      // Store error in database.
      await agentMessageRow.update({
        status: "failed",
        errorCode: event.error.code,
        errorMessage: event.error.message,
        errorMetadata: event.error.metadata,
      });
      break;

    case "agent_generation_cancelled":
      // Store cancellation in database.
      await agentMessageRow.update({
        status: "cancelled",
      });
      break;

    case "agent_message_success":
      // Store success and run IDs in database.
      await agentMessageRow.update({
        runIds: event.runIds,
        status: "succeeded",
      });

      break;

    default:
      // Ensure we handle all event types.
      break;
  }
}

async function updateResourceAndPublishEvent(
  event: AgentMessageEvents,
  conversation: ConversationType,
  agentMessageRow: AgentMessage
): Promise<void> {
  // Process database operations BEFORE publishing to Redis.
  await processEventForDatabase(event, agentMessageRow);

  await publishConversationRelatedEvent(event, {
    conversationId: conversation.sId,
  });
}

// This interface is used to execute an agent. It is not in charge of creating the AgentMessage,
// but it now handles updating it based on the execution results.
export async function runAgentWithStreaming(
  auth: Authenticator,
  configuration: LightAgentConfigurationType,
  conversation: ConversationType,
  userMessage: UserMessageType,
  // TODO(DURABLE-AGENTS 2025-07-10): DRY those two arguments to stick with only one.
  agentMessage: AgentMessageType,
  agentMessageRow: AgentMessage
): Promise<void> {
  const [fullConfiguration] = await Promise.all([
    getAgentConfiguration(auth, configuration.sId, "full"),
  ]);

  if (!fullConfiguration) {
    throw new Error(
      `Unreachable: could not find detailed configuration for agent ${configuration.sId}`
    );
  }

  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unreachable: could not find owner workspace for agent");
  }

  await Promise.all([
    // Generate a new title if the conversation does not have one already.
    await ensureConversationTitle(auth, conversation, userMessage),

    await runMultiActionsAgentLoop(
      auth,
      fullConfiguration,
      conversation,
      userMessage,
      agentMessage,
      agentMessageRow
    ),
  ]);

  // It's fine to start the workflow here because the workflow will sleep for one hour before
  // computing usage.
  await launchUpdateUsageWorkflow({ workspaceId: owner.sId });
}

async function runMultiActionsAgentLoop(
  auth: Authenticator,
  configuration: AgentConfigurationType,
  conversation: ConversationType,
  userMessage: UserMessageType,
  // TODO(DURABLE-AGENTS 2025-07-10): DRY those two arguments to stick with only one.
  agentMessage: AgentMessageType,
  agentMessageRow: AgentMessage
): Promise<void> {
  const now = Date.now();

  const isLegacyAgent = isLegacyAgentConfiguration(configuration);
  const maxStepsPerRun = isLegacyAgent ? 1 : configuration.maxStepsPerRun;

  // Citations references offset kept up to date across steps.
  let citationsRefsOffset = 0;

  const runIds: string[] = [];

  // Track step content IDs by function call ID for later use in actions.
  const functionCallStepContentIds: Record<string, ModelId> = {};

  await wakeLock(async () => {
    for (let i = 0; i < maxStepsPerRun + 1; i++) {
      const localLogger = logger.child({
        workspaceId: conversation.owner.sId,
        conversationId: conversation.sId,
        multiActionLoopIteration: i,
      });

      localLogger.info("Starting multi-action loop iteration");

      const isLastGenerationIteration = i === maxStepsPerRun;

      const actions =
        // If we already executed the maximum number of actions, we don't run anymore.
        // This will force the agent to run the generation.
        isLastGenerationIteration
          ? []
          : // Otherwise, we let the agent decide which action to run (if any).
            configuration.actions;

      const result = await runMultiActionsAgent(auth.toJSON(), {
        agentConfiguration: configuration,
        conversation,
        userMessage,
        agentMessage,
        agentActions: actions,
        isLastGenerationIteration,
        isLegacyAgent,
        agentMessageRow,
      });

      // If no actions were returned, it means we're done (generation success or error already published).
      if (!result) {
        return;
      }

      // Handle step content events if returned
      if (result && result.contents) {
        for (const [index, content] of result.contents.entries()) {
          const stepContent = await AgentStepContentResource.makeNew({
            workspaceId: conversation.owner.id,
            agentMessageId: agentMessage.agentMessageId,
            step: i,
            index,
            type: content.type,
            value: content,
            version: 0, // Will be tracked when retry logic is implemented
          });

          // If this is a function call step content, track its ID.
          if (content.type === "function_call" && content.value.id) {
            functionCallStepContentIds[content.value.id] = stepContent.id;
          }

          agentMessage.contents.push({
            step: i,
            content,
          });
        }
      }

      const actionsEvent = result?.actions;
      if (!actionsEvent) {
        continue;
      }
      // We have actions to run.
      runIds.push(actionsEvent.runId);

      localLogger.info(
        {
          elapsed: Date.now() - now,
        },
        "[ASSISTANT_TRACE] Action inputs generation"
      );

      // We received the actions to run, but will enforce a limit on the number of actions (16)
      // which is very high. Over that the latency will just be too high. This is a guardrail
      // against the model outputting something unreasonable.
      actionsEvent.actions = actionsEvent.actions.slice(
        0,
        MAX_ACTIONS_PER_STEP
      );

      await Promise.all(
        actionsEvent.actions.map(({ action, inputs, functionCallId }, index) =>
          runAction(auth, {
            configuration,
            actionConfiguration: action,
            conversation,
            agentMessage,
            inputs,
            functionCallId,
            step: i,
            stepActionIndex: index,
            stepActions: actionsEvent.actions.map((a) => a.action),
            citationsRefsOffset,
            // Find the step content ID for this function call
            stepContentId: functionCallId
              ? functionCallStepContentIds[functionCallId]
              : undefined,
            agentMessageRow,
          })
        )
      );
      // After we are done running actions, we update the inter-step refsOffset.
      for (let j = 0; j < actionsEvent.actions.length; j++) {
        citationsRefsOffset += getCitationsCount({
          agentConfiguration: configuration,
          stepActions: actionsEvent.actions.map((a) => a.action),
          stepActionIndex: j,
        });
      }
    }
  });
}

// This method is used by the multi-actions execution loop to pick the next action to execute and
// generate its inputs. Returns the actions to run if any, or null if it's a generation.
async function runMultiActionsAgent(
  authType: AuthenticatorType,
  {
    agentConfiguration,
    conversation,
    userMessage,
    agentMessage,
    agentActions,
    isLastGenerationIteration,
    isLegacyAgent,
    agentMessageRow,
  }: {
    agentConfiguration: AgentConfigurationType;
    conversation: ConversationType;
    userMessage: UserMessageType;
    agentMessage: AgentMessageType;
    agentActions: AgentActionConfigurationType[];
    isLastGenerationIteration: boolean;
    isLegacyAgent: boolean;
    agentMessageRow: AgentMessage;
  }
): Promise<AgentActionsEvent | null> {
  // Retry logic variables
  let shouldRetry = false;
  let autoRetryCount = 0;

  do {
    shouldRetry = false;
    const retryResult = await _runMultiActionsAgentWithRetry(authType, {
      agentConfiguration,
      conversation,
      userMessage,
      agentMessage,
      agentActions,
      isLastGenerationIteration,
      isLegacyAgent,
      agentMessageRow,
    });

    if (retryResult.error) {
      const { category, errorTitle, publicMessage } =
        categorizeAgentErrorMessage(retryResult.error);

      shouldRetry = ["stream_error", "retryable_model_error"].includes(
        category
      );

      if (!shouldRetry || autoRetryCount >= MAX_AUTO_RETRY) {
        logger.error(
          {
            workspaceId: conversation.owner.sId,
            conversationId: conversation.sId,
            error: retryResult.error,
            publicErrorMessage: publicMessage,
          },
          `Error running multi-actions agent (${
            shouldRetry ? "max retries reached" : "not retryable"
          }).`
        );
        await updateResourceAndPublishEvent(
          {
            type: "agent_error",
            created: Date.now(),
            configurationId: agentConfiguration.sId,
            messageId: agentMessage.sId,
            error: {
              ...retryResult.error,
              message: publicMessage,
              metadata: {
                category,
                errorTitle,
              },
            },
          },
          conversation,
          agentMessageRow
        );
        return null;
      }

      logger.warn(
        {
          workspaceId: conversation.owner.sId,
          conversationId: conversation.sId,
          error: retryResult.error,
          publicMessage,
          retryCount: autoRetryCount,
        },
        "Auto-retrying multi-actions agent."
      );
      autoRetryCount++;
    } else {
      // Track retries that lead to completing successfully.
      if (autoRetryCount > 0 && !retryResult.actions) {
        statsDClient.increment("successful_auto_retry.count", 1, [
          `retryCount:${autoRetryCount}`,
        ]);
      }
      return retryResult.actions || null;
    }
  } while (shouldRetry && autoRetryCount <= MAX_AUTO_RETRY);

  return null;
}

// Internal function that does the actual work, wrapped by retry logic
async function _runMultiActionsAgentWithRetry(
  authType: AuthenticatorType,
  {
    agentConfiguration,
    conversation,
    userMessage,
    agentMessage,
    agentActions,
    isLastGenerationIteration,
    isLegacyAgent,
    agentMessageRow,
  }: {
    agentConfiguration: AgentConfigurationType;
    conversation: ConversationType;
    userMessage: UserMessageType;
    agentMessage: AgentMessageType;
    agentActions: AgentActionConfigurationType[];
    isLastGenerationIteration: boolean;
    isLegacyAgent: boolean;
    agentMessageRow: AgentMessage;
  }
): Promise<{
  actions?: AgentActionsEvent;
  contents?: Array<
    TextContentType | FunctionCallContentType | ReasoningContentType
  >;
  error?: { code: string; message: string; metadata: any };
}> {
  // Recreate the Authenticator instance from the serialized type
  const auth = await Authenticator.fromJSON(authType);

  const model = getSupportedModelConfig(agentConfiguration.model);

  if (!model) {
    return {
      error: {
        code: "model_does_not_support_multi_actions",
        message:
          `The model you selected (${agentConfiguration.model.modelId}) ` +
          `does not support multi-actions.`,
        metadata: null,
      },
    };
  }
  const availableActions: ActionConfigurationType[] = [];

  for (const agentAction of agentActions) {
    if (isActionConfigurationType(agentAction)) {
      availableActions.push(agentAction);
    }
  }

  const attachments = listAttachments(conversation);
  const jitServers = await getJITServers(auth, {
    conversation,
    attachments,
  });

  // Get client-side MCP server configurations from user message context.
  const clientSideMCPActionConfigurations =
    await createClientSideMCPServerConfigurations(
      auth,
      userMessage.context.clientSideMCPServerIds
    );

  const {
    serverToolsAndInstructions: mcpActions,
    error: mcpToolsListingError,
  } = await tryListMCPTools(
    auth,
    {
      agentConfiguration,
      conversation,
      agentMessage,
      clientSideActionConfigurations: clientSideMCPActionConfigurations,
    },
    jitServers
  );

  if (mcpToolsListingError) {
    logger.error(
      {
        workspaceId: conversation.owner.sId,
        conversationId: conversation.sId,
        error: mcpToolsListingError,
      },
      "Error listing MCP tools."
    );
  } else {
    logger.info(
      {
        workspaceId: conversation.owner.sId,
        conversationId: conversation.sId,
      },
      "MCP tools listed successfully."
    );
  }

  if (!isLastGenerationIteration) {
    availableActions.push(...mcpActions.flatMap((s) => s.tools));
  }

  let fallbackPrompt = "You are a conversational agent";
  if (
    agentConfiguration.actions.length ||
    agentConfiguration.visualizationEnabled ||
    availableActions.length > 0
  ) {
    fallbackPrompt += " with access to tool use.";
  } else {
    fallbackPrompt += ".";
  }

  const agentsList = agentConfiguration.instructions?.includes(
    "{ASSISTANTS_LIST}"
  )
    ? await getAgentConfigurations({
        auth,
        agentsGetView: auth.user() ? "list" : "all",
        variant: "light",
      })
    : null;

  const prompt = await constructPromptMultiActions(auth, {
    userMessage,
    agentConfiguration,
    fallbackPrompt,
    model,
    hasAvailableActions: !!availableActions.length,
    errorContext: mcpToolsListingError,
    agentsList,
    conversationId: conversation.sId,
    serverToolsAndInstructions: mcpActions,
  });

  const specifications: AgentActionSpecification[] = [];
  for (const a of availableActions) {
    const specRes =
      await getRunnerForActionConfiguration(a).buildSpecification(auth);

    if (specRes.isErr()) {
      logger.error(
        {
          workspaceId: conversation.owner.sId,
          conversationId: conversation.sId,
          error: specRes.error,
        },
        "Failed to build the specification for action."
      );
      return {
        error: {
          code: "build_spec_error",
          message: `Failed to build the specification for action ${a.sId},`,
          metadata: null,
        },
      };
    }

    // Truncate the description to 1024 characters
    specRes.value.description = specRes.value.description.slice(0, 1024);

    specifications.push(specRes.value);
  }

  // Count the number of tokens used by the functions presented to the model.
  // This is a rough estimate of the number of tokens.
  const tools = JSON.stringify(
    specifications.map((s) => ({
      name: s.name,
      description: s.description,
      inputSchema: s.inputSchema,
    }))
  );

  // Turn the conversation into a digest that can be presented to the model.
  const modelConversationRes = await renderConversationForModel(auth, {
    conversation,
    model,
    prompt,
    tools,
    allowedTokenCount: model.contextSize - model.generationTokensCount,
  });

  if (modelConversationRes.isErr()) {
    logger.error(
      {
        workspaceId: conversation.owner.sId,
        conversationId: conversation.sId,
        error: modelConversationRes.error,
      },
      "Error rendering conversation for model."
    );
    return {
      error: {
        code: "conversation_render_error",
        message: `Error rendering conversation for model: ${modelConversationRes.error.message}`,
        metadata: null,
      },
    };
  }

  // Check that specifications[].name are unique. This can happen if the user overrides two actions
  // names with the same name (advanced settings). We return an actionable error if that's the case
  // as we want to keep that as an invariant when interacting with models.
  const seen = new Set<string>();
  for (const spec of specifications) {
    if (seen.has(spec.name)) {
      return {
        error: {
          code: "duplicate_specification_name",
          message:
            `Duplicate action name in agent configuration: ${spec.name}. ` +
            "Your agents actions must have unique names.",
          metadata: null,
        },
      };
    }
    seen.add(spec.name);
  }

  const runConfig = cloneBaseConfig(
    getDustProdAction("assistant-v2-multi-actions-agent").config
  );
  if (isLegacyAgent) {
    runConfig.MODEL.function_call =
      specifications.length === 1 ? specifications[0].name : null;
  } else {
    runConfig.MODEL.function_call = specifications.length === 0 ? null : "auto";
  }
  runConfig.MODEL.provider_id = model.providerId;
  runConfig.MODEL.model_id = model.modelId;
  runConfig.MODEL.temperature = agentConfiguration.model.temperature;

  const reasoningEffort =
    agentConfiguration.model.reasoningEffort ?? model.defaultReasoningEffort;
  if (reasoningEffort !== "none" && reasoningEffort !== "light") {
    runConfig.MODEL.reasoning_effort = reasoningEffort;
  }

  if (agentConfiguration.model.responseFormat) {
    runConfig.MODEL.response_format = JSON.parse(
      agentConfiguration.model.responseFormat
    );
  }
  const anthropicBetaFlags = config.getMultiActionsAgentAnthropicBetaFlags();
  if (anthropicBetaFlags) {
    runConfig.MODEL.anthropic_beta_flags = anthropicBetaFlags;
  }

  const res = await runActionStreamed(
    auth,
    "assistant-v2-multi-actions-agent",
    runConfig,
    [
      {
        conversation: modelConversationRes.value.modelConversation,
        specifications,
        prompt,
      },
    ],
    {
      conversationId: conversation.sId,
      workspaceId: conversation.owner.sId,
      userMessageId: userMessage.sId,
    }
  );

  if (res.isErr()) {
    logger.error(
      {
        workspaceId: conversation.owner.sId,
        conversationId: conversation.sId,
        error: res.error,
      },
      "Error running multi-actions agent."
    );

    return {
      error: {
        code: "multi_actions_error",
        message: `Error running agent: [${res.error.type}] ${res.error.message}`,
        metadata: null,
      },
    };
  }

  const { eventStream, dustRunId } = res.value;
  let output: {
    actions: Array<{
      functionCallId: string | null;
      name: string | null;
      arguments: Record<string, string | boolean | number> | null;
    }>;
    generation: string | null;
    contents: Array<
      TextContentType | FunctionCallContentType | ReasoningContentType
    >;
  } | null = null;

  let shouldYieldCancel = false;
  let lastCheckCancellation = Date.now();
  const redis = await getRedisClient({ origin: "assistant_generation" });
  let isGeneration = true;

  const contentParser = new AgentMessageContentParser(
    agentConfiguration,
    agentMessage.sId,
    getDelimitersConfiguration({ agentConfiguration })
  );

  const _checkCancellation = async () => {
    try {
      const cancelled = await redis.get(
        `assistant:generation:cancelled:${agentMessage.sId}`
      );
      if (cancelled === "1") {
        shouldYieldCancel = true;
        await redis.set(
          `assistant:generation:cancelled:${agentMessage.sId}`,
          0,
          {
            EX: 3600, // 1 hour
          }
        );
      }
    } catch (error) {
      logger.error({ error }, "Error checking cancellation");
      return false;
    }
  };

  let rawContent = "";
  let nativeChainOfThought = "";
  let processedContent = "";
  for await (const event of eventStream) {
    if (event.type === "function_call") {
      isGeneration = false;
    }

    if (event.type === "error") {
      for await (const token of contentParser.flushTokens()) {
        await updateResourceAndPublishEvent(
          token,
          conversation,
          agentMessageRow
        );
      }
      return {
        error: {
          code: "multi_actions_error",
          message: `Error running agent: ${event.content.message}`,
          metadata: null,
        },
      };
    }

    const currentTimestamp = Date.now();
    if (
      currentTimestamp - lastCheckCancellation >=
      CANCELLATION_CHECK_INTERVAL
    ) {
      void _checkCancellation(); // Trigger the async function without awaiting
      lastCheckCancellation = currentTimestamp;
    }

    if (shouldYieldCancel) {
      for await (const token of contentParser.flushTokens()) {
        await updateResourceAndPublishEvent(
          token,
          conversation,
          agentMessageRow
        );
      }
      await updateResourceAndPublishEvent(
        {
          type: "agent_generation_cancelled",
          created: Date.now(),
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
        },
        conversation,
        agentMessageRow
      );
      return {};
    }

    if (event.type === "tokens" && isGeneration) {
      rawContent += event.content.tokens.text;
      for await (const token of contentParser.emitTokens(
        event.content.tokens.text
      )) {
        if (token.type === "generation_tokens") {
          await updateResourceAndPublishEvent(
            token,
            conversation,
            agentMessageRow
          );
        }
      }
    }

    if (event.type === "reasoning_tokens") {
      await updateResourceAndPublishEvent(
        {
          type: "generation_tokens",
          classification: "chain_of_thought",
          created: Date.now(),
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
          text: event.content.tokens.text,
        } satisfies GenerationTokensEvent,
        conversation,
        agentMessageRow
      );
      nativeChainOfThought += event.content.tokens.text;
    }

    if (event.type === "reasoning_item") {
      await updateResourceAndPublishEvent(
        {
          type: "generation_tokens",
          classification: "chain_of_thought",
          created: Date.now(),
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
          text: "\n\n",
        } satisfies GenerationTokensEvent,
        conversation,
        agentMessageRow
      );
      nativeChainOfThought += "\n\n";
    }

    if (event.type === "block_execution") {
      const e = event.content.execution[0][0];
      if (e.error) {
        for await (const token of contentParser.flushTokens()) {
          await updateResourceAndPublishEvent(
            token,
            conversation,
            agentMessageRow
          );
        }
        return {
          error: {
            code: "multi_actions_error",
            message: `Error running agent: ${e.error}`,
            metadata: null,
          },
        };
      }

      if (event.content.block_name === "MODEL" && e.value) {
        // Flush early as we know the generation is terminated here.
        for await (const token of contentParser.flushTokens()) {
          if (token.type === "generation_tokens") {
            await updateResourceAndPublishEvent(
              token,
              conversation,
              agentMessageRow
            );
          }
        }

        const block = e.value;
        if (!isDustAppChatBlockType(block)) {
          logger.error(
            {
              workspaceId: conversation.owner.sId,
              conversationId: conversation.sId,
              error: block,
            },
            "Received unparsable MODEL block."
          );
          return {
            error: {
              code: "multi_actions_error",
              message: "Received unparsable MODEL block.",
              metadata: null,
            },
          };
        }

        // Extract token usage from block execution metadata
        const meta = e.meta as {
          token_usage?: {
            prompt_tokens: number;
            completion_tokens: number;
            reasoning_tokens?: number;
          };
        } | null;
        const reasoningTokens = meta?.token_usage?.reasoning_tokens || 0;

        const contents = (block.message.contents ?? []).map((content) => {
          if (content.type === "reasoning") {
            return {
              ...content,
              value: {
                ...content.value,
                tokens: 0, // Will be updated for the last reasoning item
                provider: model.providerId,
              },
            } satisfies ReasoningContentType;
          }
          return content;
        });

        // We unfortunately don't currently have a proper breakdown of reasoning tokens per item,
        // so we set the reasoning token count on the last reasoning item.
        for (let i = contents.length - 1; i >= 0; i--) {
          const content = contents[i];
          if (content.type === "reasoning") {
            content.value.tokens = reasoningTokens;
            contents[i] = content;
            break;
          }
        }

        output = {
          actions: [],
          generation: null,
          contents,
        };

        if (block.message.function_calls?.length) {
          for (const fc of block.message.function_calls) {
            try {
              const args = JSON.parse(fc.arguments);
              output.actions.push({
                name: fc.name,
                functionCallId: fc.id,
                arguments: args,
              });
            } catch (error) {
              logger.error(
                {
                  workspaceId: conversation.owner.sId,
                  conversationId: conversation.sId,
                  error,
                },
                "Error parsing function call arguments."
              );
              return {
                error: {
                  code: "function_call_error",
                  message: `Error parsing function call arguments: ${error}`,
                  metadata: null,
                },
              };
            }
          }
        } else {
          output.generation = block.message.content ?? null;
        }
      }
    }
  }

  for await (const token of contentParser.flushTokens()) {
    if (token.type === "generation_tokens") {
      await updateResourceAndPublishEvent(token, conversation, agentMessageRow);
    }
  }

  if (!output) {
    return {
      error: {
        code: "multi_actions_error",
        message: "Agent execution didn't complete.",
        metadata: null,
      },
    };
  }

  // Return step contents along with actions for the caller to handle
  // This allows proper step numbering and functionCallStepContentIds tracking

  if (!output.actions.length) {
    const finalProcessedContent =
      processedContent || contentParser.getContent() || "";
    if (!finalProcessedContent.length) {
      logger.warn(
        {
          workspaceId: conversation.owner.sId,
          conversationId: conversation.sId,
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
          modelId: model.modelId,
        },
        "No content generated by the agent."
      );
    }

    const chainOfThought =
      (nativeChainOfThought || contentParser.getChainOfThought()) ?? "";

    // Store chain of thought in agent message
    if (chainOfThought.length) {
      if (!agentMessage.chainOfThought) {
        agentMessage.chainOfThought = "";
      }
      agentMessage.chainOfThought += chainOfThought;
    }

    // Store content in agent message
    agentMessage.content = finalProcessedContent;
    agentMessage.status = "succeeded";

    const runId = await dustRunId;

    await updateResourceAndPublishEvent(
      {
        type: "agent_message_success",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        message: agentMessage,
        runIds: [runId],
      },
      conversation,
      agentMessageRow
    );

    return {};
  }

  // We have actions.

  if (isLastGenerationIteration) {
    return {
      error: {
        code: "tool_use_limit_reached",
        message:
          "The agent attempted to use too many tools. This model error can be safely retried.",
        metadata: null,
      },
    };
  }

  const actions: AgentActionsEvent["actions"] = [];

  for (const a of output.actions) {
    // Sometimes models will return a name with a triple underscore instead of a double underscore, we dynamically handle it.
    const actionNamesFromLLM: string[] = removeNulls([
      a.name,
      a.name?.replace("___", TOOL_NAME_SEPARATOR) ?? null,
    ]);

    let action = availableActions.find((ac) =>
      actionNamesFromLLM.includes(ac.name)
    );
    let args = a.arguments;

    if (!action) {
      if (!a.name) {
        logger.error(
          {
            workspaceId: conversation.owner.sId,
            conversationId: conversation.sId,
            configurationId: agentConfiguration.sId,
            messageId: agentMessage.sId,
            actionName: a.name,
            availableActions: availableActions.map((a) => a.name),
          },
          "Model attempted to run an action that is not part of the agent configuration (no name)."
        );
        return {
          error: {
            code: "action_not_found",
            message:
              `The agent attempted to run an invalid action (no name). ` +
              `This model error can be safely retried.`,
            metadata: null,
          },
        };
      } else {
        const mcpServerView =
          await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
            auth,
            "missing_action_catcher"
          );

        // Could happen if the internal server has not already been added
        if (!mcpServerView) {
          logger.error(
            {
              workspaceId: conversation.owner.sId,
              conversationId: conversation.sId,
              configurationId: agentConfiguration.sId,
              messageId: agentMessage.sId,
              actionName: a.name,
              availableActions: availableActions.map((a) => a.name),
            },
            "Model attempted to run an action that is not part of the agent configuration (no server)."
          );

          return {
            error: {
              code: "action_not_found",
              message:
                `The agent attempted to run an invalid action (${a.name}). ` +
                `This model error can be safely retried (no server).`,
              metadata: null,
            },
          };
        }

        logger.warn(
          {
            workspaceId: conversation.owner.sId,
            conversationId: conversation.sId,
            configurationId: agentConfiguration.sId,
            messageId: agentMessage.sId,
            actionName: a.name,
            availableActions: availableActions.map((a) => a.name),
          },
          "Model attempted to run an action that is not part of the agent configuration but we'll try to catch it."
        );

        const catchAllAction: MCPToolConfigurationType = {
          id: -1,
          sId: generateRandomModelSId(),
          type: "mcp_configuration" as const,
          name: a.name,
          originalName: a.name,
          description: null,
          dataSources: null,
          tables: null,
          childAgentId: null,
          reasoningModel: null,
          timeFrame: null,
          jsonSchema: null,
          additionalConfiguration: {},
          mcpServerViewId: mcpServerView.sId,
          dustAppConfiguration: null,
          internalMCPServerId: mcpServerView.internalMCPServerId,
          inputSchema: {},
          availability: "auto_hidden_builder",
          permission: "never_ask",
          toolServerId: mcpServerView.sId,
          mcpServerName: "missing_action_catcher" as InternalMCPServerNameType,
        };

        action = catchAllAction;
        args = {};
      }
    }

    actions.push({
      action: action!,
      inputs: args ?? {},
      functionCallId: a.functionCallId ?? null,
    });
  }

  for await (const token of contentParser.flushTokens()) {
    if (token.type === "generation_tokens") {
      await updateResourceAndPublishEvent(token, conversation, agentMessageRow);
    }
  }

  const chainOfThought =
    (nativeChainOfThought || contentParser.getChainOfThought()) ?? "";

  if (chainOfThought?.length) {
    // Store chain of thought in agent message
    if (!agentMessage.chainOfThought) {
      agentMessage.chainOfThought = "";
    }
    agentMessage.chainOfThought += chainOfThought;
  }

  // Store raw content and processed content in agentMessage
  const finalProcessedContent = contentParser.getContent() || "";
  if (rawContent.length && agentMessage.content !== undefined) {
    agentMessage.content = finalProcessedContent;
  }

  // Return the actions event to be handled by the caller
  return {
    actions: {
      type: "agent_actions",
      runId: await dustRunId,
      created: Date.now(),
      actions,
    } satisfies AgentActionsEvent,
    contents: output.contents,
  };
}

async function runAction(
  auth: Authenticator,
  {
    configuration,
    actionConfiguration,
    conversation,
    agentMessage,
    inputs,
    functionCallId,
    step,
    stepActionIndex,
    stepActions,
    citationsRefsOffset,
    stepContentId,
    // TODO(DURABLE-AGENTS 2025-07-10): DRY those arguments with agentMessage to stick with only one
    agentMessageRow,
  }: {
    configuration: AgentConfigurationType;
    actionConfiguration: ActionConfigurationType;
    conversation: ConversationType;
    agentMessage: AgentMessageType;
    inputs: Record<string, string | boolean | number>;
    functionCallId: string | null;
    step: number;
    stepActionIndex: number;
    stepActions: ActionConfigurationType[];
    citationsRefsOffset: number;
    stepContentId?: ModelId;
    agentMessageRow: AgentMessage;
  }
): Promise<void> {
  if (isMCPToolConfiguration(actionConfiguration)) {
    const eventStream = getRunnerForActionConfiguration(
      actionConfiguration
    ).run(auth, {
      agentConfiguration: configuration,
      conversation,
      agentMessage,
      rawInputs: inputs,
      functionCallId,
      step,
      stepActionIndex,
      stepActions,
      citationsRefsOffset,
      stepContentId,
    });

    for await (const event of eventStream) {
      switch (event.type) {
        case "tool_error":
          await updateResourceAndPublishEvent(
            {
              type: "agent_error",
              created: event.created,
              configurationId: configuration.sId,
              messageId: agentMessage.sId,
              error: {
                code: event.error.code,
                message: event.error.message,
                metadata: event.error.metadata,
              },
            },
            conversation,
            agentMessageRow
          );
          return;

        case "tool_success":
          await updateResourceAndPublishEvent(
            {
              type: "agent_action_success",
              created: event.created,
              configurationId: configuration.sId,
              messageId: agentMessage.sId,
              action: event.action,
            },
            conversation,
            agentMessageRow
          );

          // We stitch the action into the agent message. The conversation is expected to include
          // the agentMessage object, updating this object will update the conversation as well.
          agentMessage.actions.push(event.action);
          break;

        case "tool_params":
        case "tool_approve_execution":
        case "tool_notification":
          await updateResourceAndPublishEvent(
            event,
            conversation,
            agentMessageRow
          );
          break;

        default:
          assertNever(event);
      }
    }
  } else {
    assertNever(actionConfiguration);
  }
}

export const filterSuggestedNames = async (
  owner: WorkspaceType,
  suggestions: string[] | undefined | null
) => {
  if (!suggestions || suggestions.length === 0) {
    return [];
  }
  // Filter out suggested names that are already in use in the workspace.
  const existingNames = (
    await AgentConfiguration.findAll({
      where: {
        workspaceId: owner.id,
        status: "active",
      },
      attributes: ["name"],
    })
  ).map((ac) => ac.name.toLowerCase());

  return suggestions?.filter(
    (s: string) => !existingNames.includes(s.toLowerCase())
  );
};
