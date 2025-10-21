import assert from "assert";

import { buildToolSpecification } from "@app/lib/actions/mcp";
import {
  TOOL_NAME_SEPARATOR,
  tryListMCPTools,
} from "@app/lib/actions/mcp_actions";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { StepContext } from "@app/lib/actions/types";
import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { computeStepContexts } from "@app/lib/actions/utils";
import { createClientSideMCPServerConfigurations } from "@app/lib/api/actions/mcp_client_side";
import {
  AgentMessageContentParser,
  getDelimitersConfiguration,
} from "@app/lib/api/assistant/agent_message_content_parser";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { renderConversationForModel } from "@app/lib/api/assistant/conversation_rendering";
import {
  categorizeAgentErrorMessage,
  categorizeConversationRenderErrorMessage,
} from "@app/lib/api/assistant/errors";
import { constructPromptMultiActions } from "@app/lib/api/assistant/generation";
import { getJITServers } from "@app/lib/api/assistant/jit_actions";
import { listAttachments } from "@app/lib/api/assistant/jit_utils";
import { isLegacyAgentConfiguration } from "@app/lib/api/assistant/legacy_agent";
import { fetchMessageInConversation } from "@app/lib/api/assistant/messages";
import config from "@app/lib/api/config";
import { getLLM } from "@app/lib/api/llm";
import { DEFAULT_MCP_TOOL_RETRY_POLICY } from "@app/lib/api/mcp";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { cloneBaseConfig, getDustProdAction } from "@app/lib/registry";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";
import { updateResourceAndPublishEvent } from "@app/temporal/agent_loop/activities/common";
import { getOutputFromAction } from "@app/temporal/agent_loop/lib/get_output_from_action";
import { getOutputFromLLMStream } from "@app/temporal/agent_loop/lib/get_output_from_llm";
import { sliceConversationForAgentMessage } from "@app/temporal/agent_loop/lib/loop_utils";
import type { GetOutputFromStreamResponse } from "@app/temporal/agent_loop/lib/types";
import type { AgentActionsEvent, ModelId, Result } from "@app/types";
import { removeNulls } from "@app/types";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";

const MAX_AUTO_RETRY = 3;

// This method is used by the multi-actions execution loop to pick the next
// action to execute and generate its inputs.
//
// TODO(DURABLE-AGENTS 2025-07-20): The method mutates agentMessage, this must
// be refactored in a follow up PR.
export async function runModelActivity(
  auth: Authenticator,
  {
    runAgentData,
    runIds,
    step,
    functionCallStepContentIds,
    autoRetryCount = 0,
  }: {
    runAgentData: AgentLoopExecutionData;
    runIds: string[];
    step: number;
    functionCallStepContentIds: Record<string, ModelId>;
    autoRetryCount?: number;
  }
): Promise<{
  actions: AgentActionsEvent["actions"];
  runId: string;
  functionCallStepContentIds: Record<string, ModelId>;
  stepContexts: StepContext[];
} | null> {
  const {
    agentConfiguration,
    conversation: originalConversation,
    userMessage,
    agentMessage: originalAgentMessage,
    agentMessageRow,
  } = runAgentData;

  const { slicedConversation: conversation, slicedAgentMessage: agentMessage } =
    sliceConversationForAgentMessage(originalConversation, {
      agentMessageId: originalAgentMessage.sId,
      agentMessageVersion: originalAgentMessage.version,
      step,
    });

  // Compute the citations offset by summing citations allocated to all past actions for this message.
  const citationsRefsOffset = originalAgentMessage.actions.reduce(
    (total, action) => total + (action.citationsAllocated || 0),
    0
  );

  const now = Date.now();

  const localLogger = logger.child({
    workspaceId: conversation.owner.sId,
    conversationId: conversation.sId,
    multiActionLoopIteration: step,
  });

  localLogger.info("Starting multi-action loop iteration");

  const isLegacyAgent = isLegacyAgentConfiguration(agentConfiguration);
  if (isLegacyAgent && step !== 0) {
    localLogger.warn("Legacy agent only supports step 0.");
    // legacy agents stop after one step
    return null;
  }

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

    await updateResourceAndPublishEvent(auth, {
      event: {
        type: "agent_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error,
      },
      agentMessageRow,
      conversation,
      step,
    });
  }

  // Helper function to flush all pending tokens from the content parser
  async function flushParserTokens(): Promise<void> {
    for await (const tokenEvent of contentParser.flushTokens()) {
      await updateResourceAndPublishEvent(auth, {
        event: tokenEvent,
        agentMessageRow,
        conversation,
        step,
      });
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

  const attachments = listAttachments(conversation);
  const jitServers = await getJITServers(auth, {
    agentConfiguration,
    conversation,
    attachments,
  });
  // Get client-side MCP server configurations from the user message context.
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

  const isLastStep = step === agentConfiguration.maxStepsPerRun;

  // If we are on the last step, we don't show any action.
  // This will force the agent to run the generation.
  const availableActions = isLastStep ? [] : mcpActions.flatMap((s) => s.tools);

  let fallbackPrompt = "You are a conversational agent";
  if (agentConfiguration.actions.length || availableActions.length > 0) {
    fallbackPrompt += " with access to tool use.";
  } else {
    fallbackPrompt += ".";
  }

  const agentsList = agentConfiguration.instructions?.includes(
    "{ASSISTANTS_LIST}"
  )
    ? await getAgentConfigurationsForView({
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
    specifications.push(buildToolSpecification(a));
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
    const categorizedError = categorizeConversationRenderErrorMessage(
      modelConversationRes.error
    );
    if (categorizedError) {
      await publishAgentError({
        code: "conversation_render_error",
        message: categorizedError.publicMessage,
        metadata: {
          category: categorizedError.category,
          errorTitle: categorizedError.errorTitle,
        },
      });
      return null;
    }

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

  if (
    reasoningEffort !== "none" &&
    (reasoningEffort !== "light" || model.useNativeLightReasoning)
  ) {
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

  // Set prompt_caching from agent configuration
  if (agentConfiguration.model.promptCaching) {
    runConfig.MODEL.prompt_caching = agentConfiguration.model.promptCaching;
  }

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
      return runModelActivity(auth, {
        runAgentData,
        runIds,
        step,
        functionCallStepContentIds,
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

  const contentParser = new AgentMessageContentParser(
    agentConfiguration,
    agentMessage.sId,
    getDelimitersConfiguration({ agentConfiguration })
  );

  let res: Result<GetOutputFromStreamResponse | null, Error>;

  const llm = await getLLM(auth, { model });

  if (llm === null) {
    res = await getOutputFromAction(auth, {
      runConfig,
      modelConversation: modelConversationRes.value.modelConversation,
      specifications,
      conversation,
      runAgentData,
      agentMessage,
      contentParser,
      flushParserTokens,
      step,
      publishAgentError,
      prompt,
    });
  } else {
    res = await getOutputFromLLMStream(auth, {
      llm,
      modelConversation: modelConversationRes.value.modelConversation,
      prompt,
      specifications,
      conversation,
      runAgentData,
      agentMessage,
      contentParser,
      flushParserTokens,
      step,
    });
  }

  if (res.isErr()) {
    return handlePossiblyRetryableError(res.error.message);
  }

  // Conversation has been cancelled or error while parsing arguments
  if (res.value === null) {
    return null;
  }

  const { output, nativeChainOfThought, dustRunId } = res.value;

  // It is possible that temporal requested activity cancellation but the
  // activity has not yet received the signal. In that case, the agent message
  // row would have status to cancelled (done via finalizeCancellationActivity).
  const message = await fetchMessageInConversation(
    auth,
    conversation,
    agentMessage.sId,
    agentMessage.version
  );
  if (message?.agentMessage?.status === "cancelled") {
    logger.info("Agent message cancelled, stopping");
    return null;
  }

  // Create a new object to avoid mutation
  const updatedFunctionCallStepContentIds = { ...functionCallStepContentIds };

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
    agentMessage.completedTs = Date.now();

    await updateResourceAndPublishEvent(auth, {
      event: {
        type: "agent_message_success",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        message: agentMessage,
        runIds: [...runIds, await dustRunId],
      },
      agentMessageRow,
      conversation,
      step,
    });
    localLogger.info("Agent message generation succeeded");

    return null;
  }

  // We have actions.
  localLogger.info(
    {
      elapsed: Date.now() - now,
    },
    "[ASSISTANT_TRACE] Action inputs generation"
  );

  // Inject a single newline boundary if we streamed visible content in this iteration
  // before yielding actions. This prevents the next iteration's streamed tokens from
  // being appended without whitespace. Only do this if generation tokens are non-empty
  // and the last character is not already whitespace.
  const streamedContentSoFar = contentParser.getContent() ?? "";
  if (
    streamedContentSoFar.length > 0 &&
    !/\s/.test(streamedContentSoFar[streamedContentSoFar.length - 1])
  ) {
    await updateResourceAndPublishEvent(auth, {
      event: {
        type: "generation_tokens",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        text: "\n",
        classification: "tokens",
      },
      agentMessageRow,
      conversation,
      step,
    });
  }

  // If we have actions and we are on the last step, we error since returning actions would require
  // doing one more step.
  if (isLastStep) {
    await publishAgentError({
      code: "max_step_reached",
      message:
        "The agent reached the maximum number of steps. This error can be safely retried.",
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

      assert(
        mcpServerView.internalMCPServerId,
        "Internal MCP server ID is null"
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
        secretName: null,
        additionalConfiguration: {},
        mcpServerViewId: mcpServerView.sId,
        dustAppConfiguration: null,
        internalMCPServerId: mcpServerView.internalMCPServerId,
        inputSchema: {},
        availability: "auto_hidden_builder",
        permission: "never_ask",
        toolServerId: mcpServerView.internalMCPServerId,
        mcpServerName: "missing_action_catcher" as InternalMCPServerNameType,
        retryPolicy: DEFAULT_MCP_TOOL_RETRY_POLICY,
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
