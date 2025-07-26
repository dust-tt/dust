import { removeNulls } from "@dust-tt/client";

import { buildToolSpecification } from "@app/lib/actions/mcp";
import {
  TOOL_NAME_SEPARATOR,
  tryListMCPTools,
} from "@app/lib/actions/mcp_actions";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  isDustAppChatBlockType,
  runActionStreamed,
} from "@app/lib/actions/server";
import type { StepContext } from "@app/lib/actions/types";
import type {
  ActionConfigurationType,
  AgentActionSpecification,
} from "@app/lib/actions/types/agent";
import { isActionConfigurationType } from "@app/lib/actions/types/agent";
import { computeStepContexts } from "@app/lib/actions/utils";
import { createClientSideMCPServerConfigurations } from "@app/lib/api/actions/mcp_client_side";
import { categorizeAgentErrorMessage } from "@app/lib/api/assistant/agent_errors";
import {
  AgentMessageContentParser,
  getDelimitersConfiguration,
} from "@app/lib/api/assistant/agent_message_content_parser";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration";
import { constructPromptMultiActions } from "@app/lib/api/assistant/generation";
import { getJITServers } from "@app/lib/api/assistant/jit_actions";
import { listAttachments } from "@app/lib/api/assistant/jit_utils";
import { isLegacyAgentConfiguration } from "@app/lib/api/assistant/legacy_agent";
import { renderConversationForModel } from "@app/lib/api/assistant/preprocessing";
import config from "@app/lib/api/config";
import { getRedisClient } from "@app/lib/api/redis";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { cloneBaseConfig, getDustProdAction } from "@app/lib/registry";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";
import { updateResourceAndPublishEvent } from "@app/temporal/agent_loop/activities/common";
import type { AgentActionsEvent, ModelId } from "@app/types";
import type {
  FunctionCallContentType,
  ReasoningContentType,
  TextContentType,
} from "@app/types/assistant/agent_message_content";
import type { RunAgentArgs } from "@app/types/assistant/agent_run";
import { getRunAgentData } from "@app/types/assistant/agent_run";
import { sliceConversationForAgentMessage } from "@app/temporal/agent_loop/lib/loop_utils";

const CANCELLATION_CHECK_INTERVAL = 500;
const MAX_AUTO_RETRY = 3;

// This method is used by the multi-actions execution loop to pick the next
// action to execute and generate its inputs.
//
// TODO(DURABLE-AGENTS 2025-07-20): The method mutates agentMessage, this must

// be refactored in a follow up PR.
export async function runModelActivity({
  authType,
  runAgentArgs,
  runIds,
  step,
  functionCallStepContentIds,
  citationsRefsOffset,
  autoRetryCount = 0,
}: {
  authType: AuthenticatorType;
  runAgentArgs: RunAgentArgs;
  runIds: string[];
  step: number;
  functionCallStepContentIds: Record<string, ModelId>;
  citationsRefsOffset: number;
  autoRetryCount?: number;
}): Promise<{
  actions: AgentActionsEvent["actions"];
  runId: string;
  functionCallStepContentIds: Record<string, ModelId>;
  stepContexts: StepContext[];
} | null> {
  const runAgentDataRes = await getRunAgentData(authType, runAgentArgs, step);

  if (runAgentDataRes.isErr()) {
    throw runAgentDataRes.error;
  }

  const {
    agentConfiguration,
    conversation,
    userMessage,
    agentMessage,
    agentMessageRow,
  } = runAgentDataRes.value;

  const now = Date.now();

  const localLogger = logger.child({
    workspaceId: conversation.owner.sId,
    conversationId: conversation.sId,
    multiActionLoopIteration: step,
  });

  localLogger.info("Starting multi-action loop iteration");

  const isLegacyAgent = isLegacyAgentConfiguration(agentConfiguration);
  if (isLegacyAgent && step !== 0) {
    // legacy agents stop after one step
    return null;
  }

  const isLastGenerationIteration = step === agentConfiguration.maxStepsPerRun;

  const agentActions =
    // If we already executed the maximum number of actions, we don't run anymore.
    // This will force the agent to run the generation.
    isLastGenerationIteration
      ? []
      : // Otherwise, we let the agent decide which action to run (if any).
        agentConfiguration.actions;

  const auth = await Authenticator.fromJSON(authType);

  const model = getSupportedModelConfig(agentConfiguration.model);

  async function publishAgentError(error: {
    code: string;
    message: string;
    metadata: Record<string, string | number | boolean> | null;
  }): Promise<void> {
    // Check if this is a multi_actions_error that hit max retries
    let logMessage = `Agent error: ${error.message}`;
    if (
      error.code === "multi_actions_error" &&
      error.metadata?.retriesAttempted === MAX_AUTO_RETRY
    ) {
      logMessage = `Agent error: ${error.message} (max retries reached)`;
    } else if (
      error.code === "multi_actions_error" &&
      error.metadata?.category &&
      error.metadata.category !== "retryable_model_error"
    ) {
      logMessage = `Agent error: ${error.message} (not retryable)`;
    }

    localLogger.error(
      {
        error,
      },
      logMessage
    );

    await updateResourceAndPublishEvent(
      {
        type: "agent_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error,
      },
      conversation,
      agentMessageRow,
      step
    );
  }

  // Helper function to flush all pending tokens from the content parser
  async function flushParserTokens(): Promise<void> {
    for await (const tokenEvent of contentParser.flushTokens()) {
      await updateResourceAndPublishEvent(
        tokenEvent,
        conversation,
        agentMessageRow,
        step
      );
    }
  }

  if (!model) {
    await publishAgentError({
      code: "model_does_not_support_multi_actions",
      message:
        `The model you selected (${agentConfiguration.model.modelId}) ` +
        `does not support multi-actions.`,
      metadata: null,
    });
    return null;
  }
  const availableActions: ActionConfigurationType[] = [];

  for (const agentAction of agentActions) {
    if (isActionConfigurationType(agentAction)) {
      logger.info("Found an available action on the agentConfiguration.");
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
    localLogger.error(
      {
        error: mcpToolsListingError,
      },
      "Error listing MCP tools."
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
    hasAvailableActions: availableActions.length > 0,
    errorContext: mcpToolsListingError,
    agentsList,
    conversationId: conversation.sId,
    serverToolsAndInstructions: mcpActions,
  });

  const specifications: AgentActionSpecification[] = [];
  for (const a of availableActions) {
    const specRes = await buildToolSpecification(auth, a);

    if (specRes.isErr()) {
      await publishAgentError({
        code: "build_spec_error",
        message: `Failed to build the specification for action ${a.sId},`,
        metadata: null,
      });

      return null;
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
    await publishAgentError({
      code: "conversation_render_error",
      message: `Error rendering conversation for model: ${modelConversationRes.error.message}`,
      metadata: null,
    });

    return null;
  }

  // Check that specifications[].name are unique. This can happen if the user overrides two actions
  // names with the same name (advanced settings). We return an actionable error if that's the case
  // as we want to keep that as an invariant when interacting with models.
  const seen = new Set<string>();
  for (const spec of specifications) {
    if (seen.has(spec.name)) {
      await publishAgentError({
        code: "duplicate_specification_name",
        message:
          `Duplicate action name in agent configuration: ${spec.name}. ` +
          "Your agents actions must have unique names.",
        metadata: null,
      });

      return null;
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

  // Errors occurring during the multi-actions-agent dust app may be retryable.
  // Their implicit code should be "multi_actions_error".
  async function handlePossiblyRetryableError(message: string) {
    const { category, publicMessage, errorTitle } = categorizeAgentErrorMessage(
      {
        code: "multi_actions_error",
        message,
      }
    );

    const isRetryableModelError = [
      "retryable_model_error",
      "stream_error",
    ].includes(category);

    if (isRetryableModelError && autoRetryCount < MAX_AUTO_RETRY) {
      localLogger.warn(
        {
          error: message,
          retryCount: autoRetryCount + 1,
          maxRetries: MAX_AUTO_RETRY,
        },
        "Auto-retrying multi-actions agent due to retryable model error."
      );

      // Recursively retry with incremented count
      return runModelActivity({
        authType,
        runAgentArgs,
        runIds,
        step,
        functionCallStepContentIds,
        citationsRefsOffset,
        autoRetryCount: autoRetryCount + 1,
      });
    }

    await publishAgentError({
      code: "multi_actions_error",
      message: publicMessage,
      metadata: {
        category,
        errorTitle,
        retriesAttempted: autoRetryCount,
      },
    });

    return null;
  }

  if (res.isErr()) {
    return handlePossiblyRetryableError(res.error.message);
  }

  const { eventStream, dustRunId } = res.value;
  let output: {
    actions: Array<{
      functionCallId: string;
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

  async function checkCancellation() {
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
      localLogger.error({ error }, "Error checking cancellation");
      return false;
    }
  }

  let nativeChainOfThought = "";

  // Create a new object to avoid mutation
  const updatedFunctionCallStepContentIds = { ...functionCallStepContentIds };

  for await (const event of eventStream) {
    if (event.type === "function_call") {
      isGeneration = false;
    }

    if (event.type === "error") {
      await flushParserTokens();
      return handlePossiblyRetryableError(event.content.message);
    }

    const currentTimestamp = Date.now();
    if (
      currentTimestamp - lastCheckCancellation >=
      CANCELLATION_CHECK_INTERVAL
    ) {
      void checkCancellation(); // Trigger the async function without awaiting
      lastCheckCancellation = currentTimestamp;
    }

    if (shouldYieldCancel) {
      await flushParserTokens();
      await updateResourceAndPublishEvent(
        {
          type: "agent_generation_cancelled",
          created: Date.now(),
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
        },
        conversation,
        agentMessageRow,
        step
      );
      return null;
    }

    if (event.type === "tokens" && isGeneration) {
      for await (const tokenEvent of contentParser.emitTokens(
        event.content.tokens.text
      )) {
        await updateResourceAndPublishEvent(
          tokenEvent,
          conversation,
          agentMessageRow,
          step
        );
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
        },
        conversation,
        agentMessageRow,
        step
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
        },
        conversation,
        agentMessageRow,
        step
      );
      nativeChainOfThought += "\n\n";
    }

    if (event.type === "block_execution") {
      const e = event.content.execution[0][0];
      if (e.error) {
        await flushParserTokens();
        return handlePossiblyRetryableError(e.error);
      }

      if (event.content.block_name === "MODEL" && e.value) {
        // Flush early as we know the generation is terminated here.
        await flushParserTokens();

        const block = e.value;
        if (!isDustAppChatBlockType(block)) {
          return handlePossiblyRetryableError(
            "Received unparsable MODEL block."
          );
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
              await publishAgentError({
                code: "function_call_error",
                message: `Error parsing function call arguments: ${error}`,
                metadata: null,
              });
              return null;
            }
          }
        } else {
          output.generation = block.message.content ?? null;
        }
      }
    }
  }

  await flushParserTokens();

  if (!output) {
    return handlePossiblyRetryableError("Agent execution didn't complete.");
  }

  // Create AgentStepContent for each content item (reasoning, text, function calls)
  // This replaces the original agent_step_content event emission
  for (const [index, content] of output.contents.entries()) {
    const stepContent = await AgentStepContentResource.createNewVersion({
      workspaceId: conversation.owner.id,
      agentMessageId: agentMessage.agentMessageId,
      step,
      index,
      type: content.type,
      value: content,
    });

    // If this is a function call content, track the step content ID
    if (content.type === "function_call") {
      updatedFunctionCallStepContentIds[content.value.id] = stepContent.id;
    }
  }

  // Track retries that lead to completing successfully (with either function calls or generation).
  if (autoRetryCount > 0) {
    statsDClient.increment("successful_auto_retry.count", 1, [
      `retryCount:${autoRetryCount}`,
    ]);
  }

  // Store the contents for returning to the caller
  // These will be added to agentMessage.contents in the calling function

  if (!output.actions.length) {
    // Successful generation.
    const processedContent = contentParser.getContent() ?? "";
    if (!processedContent.length) {
      localLogger.warn(
        {
          modelId: model.modelId,
        },
        "No content generated by the agent."
      );
    }

    // TODO(DURABLE-AGENTS 2025-07-20): Avoid mutating agentMessage here
    const chainOfThought =
      (nativeChainOfThought || contentParser.getChainOfThought()) ?? "";

    if (chainOfThought.length) {
      if (!agentMessage.chainOfThought) {
        agentMessage.chainOfThought = "";
      }
      agentMessage.chainOfThought += chainOfThought;
    }
    agentMessage.content = (agentMessage.content ?? "") + processedContent;
    agentMessage.status = "succeeded";

    await updateResourceAndPublishEvent(
      {
        type: "agent_message_success",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        message: agentMessage,
        runIds: [...runIds, await dustRunId],
      },
      conversation,
      agentMessageRow,
      step
    );

    return null;
  }

  // We have actions.
  localLogger.info(
    {
      elapsed: Date.now() - now,
    },
    "[ASSISTANT_TRACE] Action inputs generation"
  );

  if (isLastGenerationIteration) {
    await publishAgentError({
      code: "tool_use_limit_reached",
      message:
        "The agent attempted to use too many tools. This model error can be safely retried.",
      metadata: null,
    });
    return null;
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

    if (!action) {
      if (!a.name) {
        await publishAgentError({
          code: "action_not_found",
          message:
            `The agent attempted to run an invalid action (no name). ` +
            `This model error can be safely retried.`,
          metadata: null,
        });

        return null;
      }
      const mcpServerView =
        await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
          auth,
          "missing_action_catcher"
        );

      // Could happen if the internal server has not already been added
      if (!mcpServerView) {
        await publishAgentError({
          code: "action_not_found",
          message:
            `The agent attempted to run an invalid action (${a.name}). ` +
            `This model error can be safely retried (no server).`,
          metadata: null,
        });
        return null;
      }

      localLogger.warn(
        {
          actionName: a.name,
          availableActions: availableActions.map((a) => a.name),
        },
        "Model attempted to run an action that is not part of the agent configuration but we'll try to catch it."
      );

      // Catch-all action.
      action = {
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
    }

    actions.push({
      action,
      functionCallId: a.functionCallId ?? null,
    });
  }

  await flushParserTokens();

  const chainOfThought =
    (nativeChainOfThought || contentParser.getChainOfThought()) ?? "";

  agentMessage.content =
    (agentMessage.content ?? "") + (contentParser.getContent() ?? "");

  if (chainOfThought.length) {
    if (!agentMessage.chainOfThought) {
      agentMessage.chainOfThought = "";
    }
    agentMessage.chainOfThought += chainOfThought;
  }

  const newContents = output.contents.map((content) => ({
    step,
    content,
  }));
  agentMessage.contents.push(...newContents);

  const stepContexts = computeStepContexts({
    agentConfiguration,
    stepActions: actions.map((a) => a.action),
    citationsRefsOffset,
  });

  return {
    actions,
    runId: await dustRunId,
    functionCallStepContentIds: updatedFunctionCallStepContentIds,
    stepContexts,
  };
}
