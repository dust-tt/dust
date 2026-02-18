import { TOOL_NAME_SEPARATOR } from "@app/lib/actions/constants";
import { buildToolSpecification } from "@app/lib/actions/mcp";
import { tryListMCPTools } from "@app/lib/actions/mcp_actions";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { StepContext } from "@app/lib/actions/types";
import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { isServerSideMCPServerConfigurationWithName } from "@app/lib/actions/types/guards";
import { computeStepContexts } from "@app/lib/actions/utils";
import { createClientSideMCPServerConfigurations } from "@app/lib/api/actions/mcp_client_side";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { renderConversationForModel } from "@app/lib/api/assistant/conversation_rendering";
import { categorizeConversationRenderErrorMessage } from "@app/lib/api/assistant/errors";
import { constructPromptMultiActions } from "@app/lib/api/assistant/generation";
import { buildMemoriesContext } from "@app/lib/api/assistant/global_agents/configurations/dust/dust";
import { globalAgentInjectsMemory } from "@app/lib/api/assistant/global_agents/global_agents";
import { getJITServers } from "@app/lib/api/assistant/jit_actions";
import { listAttachments } from "@app/lib/api/assistant/jit_utils";
import { isLegacyAgentConfiguration } from "@app/lib/api/assistant/legacy_agent";
import {
  fetchMessageInConversation,
  getCompletionDuration,
} from "@app/lib/api/assistant/messages";
import {
  createSkillKnowledgeDataWarehouseServer,
  createSkillKnowledgeFileSystemServer,
  getSkillDataSourceConfigurations,
  getSkillServers,
} from "@app/lib/api/assistant/skill_actions";
import { getLLM } from "@app/lib/api/llm";
import type { LLMTraceContext } from "@app/lib/api/llm/traces/types";
import { getUserFacingLLMErrorMessage } from "@app/lib/api/llm/types/errors";
import { systemPromptToText } from "@app/lib/api/llm/types/options";
import { DEFAULT_MCP_TOOL_RETRY_POLICY } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMessageContentParser,
  getDelimitersConfiguration,
} from "@app/lib/llms/agent_message_content_parser";
import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import { AgentMemoryResource } from "@app/lib/resources/agent_memory_resource";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import tracer from "@app/logger/tracer";
import { updateResourceAndPublishEvent } from "@app/temporal/agent_loop/activities/common";
import { RUN_MODEL_MAX_RETRIES } from "@app/temporal/agent_loop/config";
import { getOutputFromLLMStream } from "@app/temporal/agent_loop/lib/get_output_from_llm";
import { sliceConversationForAgentMessage } from "@app/temporal/agent_loop/lib/loop_utils";
import type { AgentActionsEvent } from "@app/types/assistant/agent";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import type { AgentMessageType } from "@app/types/assistant/conversation";
import { isTextContent } from "@app/types/assistant/generation";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { ModelId } from "@app/types/shared/model_id";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";
import { startActiveObservation } from "@langfuse/tracing";
import { Context, heartbeat } from "@temporalio/activity";
import assert from "assert";

// This method is used by the multi-actions execution loop to pick the next action to execute and
// generate its inputs.
export async function runModel(
  auth: Authenticator,
  {
    runAgentData,
    runIds,
    step,
    functionCallStepContentIds,
    featureFlags,
  }: {
    runAgentData: AgentLoopExecutionData;
    runIds: string[];
    step: number;
    functionCallStepContentIds: Record<string, ModelId>;
    featureFlags: WhitelistableFeature[];
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

  async function publishAgentError(
    error: {
      code: string;
      message: string;
      metadata: Record<string, string | number | boolean> | null;
    },
    dustRunId?: string
  ): Promise<void> {
    // Check if this is a multi_actions_error that hit max retries
    const logMessage = `Agent error: ${error.message}`;

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
        runIds: dustRunId ? [...runIds, dustRunId] : runIds,
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

  const {
    enabledSkills,
    equippedSkills,
    hasConditionalJITTools,
    mcpActions,
    mcpToolsListingError,
  } = await startActiveObservation("resolve-tools", async () => {
    const attachments = listAttachments(conversation);
    const { servers: jitServers, hasConditionalJITTools } = await getJITServers(
      auth,
      {
        agentConfiguration,
        conversation,
        attachments,
      }
    );

    const clientSideMCPActionConfigurations =
      await createClientSideMCPServerConfigurations(
        auth,
        userMessage.context.clientSideMCPServerIds
      );

    const { enabledSkills, equippedSkills } =
      await SkillResource.listForAgentLoop(auth, runAgentData);

    const skillServers = await getSkillServers(auth, {
      agentConfiguration,
      skills: enabledSkills,
    });

    // Add file system / data warehouse servers if skills have attached knowledge.
    const {
      documentDataSourceConfigurations,
      warehouseDataSourceConfigurations,
    } = await getSkillDataSourceConfigurations(auth, {
      skills: enabledSkills,
    });

    const fileSystemServer = await createSkillKnowledgeFileSystemServer(auth, {
      dataSourceConfigurations: documentDataSourceConfigurations,
    });
    const dataWarehouseServer = await createSkillKnowledgeDataWarehouseServer(
      auth,
      {
        dataSourceConfigurations: warehouseDataSourceConfigurations,
      }
    );
    if (fileSystemServer) {
      skillServers.push(fileSystemServer);
    }
    if (dataWarehouseServer) {
      skillServers.push(dataWarehouseServer);
    }

    const {
      serverToolsAndInstructions: mcpActions,
      error: mcpToolsListingError,
    } = await startActiveObservation("list-mcp-tools", () =>
      tryListMCPTools(
        auth,
        {
          agentConfiguration,
          conversation,
          agentMessage,
          clientSideActionConfigurations: clientSideMCPActionConfigurations,
        },
        { jitServers, skillServers }
      )
    );

    return {
      hasConditionalJITTools,
      enabledSkills,
      equippedSkills,
      mcpActions,
      mcpToolsListingError,
    };
  });

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

  let memoriesContext: string | undefined;
  const hasAgentMemoryAction = agentConfiguration.actions.some((action) =>
    isServerSideMCPServerConfigurationWithName(action, "agent_memory")
  );
  if (
    globalAgentInjectsMemory(agentConfiguration.sId) &&
    hasAgentMemoryAction &&
    auth.user()
  ) {
    const memories =
      await AgentMemoryResource.findByAgentConfigurationIdAndUser(auth, {
        agentConfigurationId: agentConfiguration.sId,
      });
    memoriesContext = buildMemoriesContext(memories);
  }

  const prompt = constructPromptMultiActions(auth, {
    userMessage,
    agentConfiguration,
    fallbackPrompt,
    model,
    hasAvailableActions: availableActions.length > 0,
    errorContext: mcpToolsListingError,
    agentsList,
    conversation,
    serverToolsAndInstructions: mcpActions,
    enabledSkills,
    equippedSkills,
    memoriesContext,
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
  const promptText = systemPromptToText(prompt);
  const modelConversationRes = await startActiveObservation(
    "render-conversation",
    () =>
      tracer.trace("renderConversationForModel", async () =>
        renderConversationForModel(auth, {
          conversation,
          model,
          prompt: promptText,
          tools,
          allowedTokenCount: model.contextSize - model.generationTokensCount,
          agentConfiguration,
          featureFlags,
        })
      )
  );

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

  // Temporarily adding this to check if we can consider contents property only in llms
  const unexpectedMessage =
    modelConversationRes.value.modelConversation.messages.find(
      (m) => m.role === "assistant" && !m.contents && m.content
    );
  if (unexpectedMessage) {
    logger.error(
      {
        conversationId: conversation.sId,
        agentMessageId: agentMessage.sId,
        step,
      },
      "Found assistant message with legacy content field instead of contents array"
    );
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
          `Found multiple tools named "${spec.name}". ` +
          "Each tool needs a unique name so the agent can specify which one to use.",
        metadata: null,
      });

      return null;
    }
    seen.add(spec.name);
  }

  const contentParser = new AgentMessageContentParser(
    agentConfiguration,
    agentMessage.sId,
    getDelimitersConfiguration({ agentConfiguration })
  );

  const traceContext: LLMTraceContext = {
    operationType: "agent_conversation",
    agentConfigurationId: agentConfiguration.sId,
    conversationId: conversation.sId,
    userId: auth.user()?.sId,
    workspaceId: conversation.owner.sId,
  };

  const llm = await getLLM(auth, {
    modelId: model.modelId,
    temperature: agentConfiguration.model.temperature,
    reasoningEffort: agentConfiguration.model.reasoningEffort,
    responseFormat: agentConfiguration.model.responseFormat,
    context: traceContext,
    // Custom trace input: show only the last user message instead of full conversation.
    getTraceInput: (conv) => {
      const lastUserMessage = conv.messages.findLast(
        (msg) => msg.role === "user"
      );
      return lastUserMessage?.content
        .filter(isTextContent)
        .map((item) => item.text)
        .join("\n");
    },
    // Custom trace output: only set on final call (no tool calls, has content).
    getTraceOutput: (output) =>
      !output.toolCalls?.length && output.content ? output.content : undefined,
  });

  // Should not happen
  if (llm === null) {
    localLogger.error(
      {
        conversationId: conversation.sId,
        workspaceId: conversation.owner.sId,
      },
      "LLM is null in runModel, cannot proceed."
    );

    return null;
  }

  const metadata = llm.getMetadata();

  const modelInteractionStartDate = performance.now();

  // Heartbeat before starting the LLM stream to ensure the activity is still
  // considered alive after potentially long setup operations (MCP tools
  // listing, conversation rendering, etc.).
  heartbeat();

  localLogger.info(
    {
      modelId: model.modelId,
      messageCount:
        modelConversationRes.value.modelConversation.messages.length,
      toolCount: specifications.length,
    },
    "[LLM stream] Starting (agent loop)"
  );

  if (
    modelConversationRes.value.prunedContext === true &&
    !agentMessageRow.prunedContext
  ) {
    await agentMessageRow.update({
      prunedContext: true,
    });

    await updateResourceAndPublishEvent(auth, {
      event: {
        type: "agent_context_pruned",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
      },
      agentMessageRow,
      conversation,
      step,
    });
  }

  const getOutputFromActionResponse = await getOutputFromLLMStream(auth, {
    modelConversationRes,
    conversation,
    hasConditionalJITTools,
    userMessage,
    specifications,
    flushParserTokens,
    contentParser,
    agentMessageRow,
    step,
    agentConfiguration,
    agentMessage,
    model,
    publishAgentError,
    prompt,
    llm,
    updateResourceAndPublishEvent,
  });

  const modelInteractionEndDate = performance.now();

  if (getOutputFromActionResponse.isErr()) {
    const error = getOutputFromActionResponse.error;

    switch (error.type) {
      case "shouldRetryMessage": {
        const { type, isRetryable } = error.content;
        const errorDustRunId = llm?.getTraceId();
        const currentAttempt = Context.current().info.attempt;
        const isLastAttempt = currentAttempt >= RUN_MODEL_MAX_RETRIES;

        if (!isRetryable || isLastAttempt) {
          // Non-retryable errors or last retry attempt: surface error to user.
          await publishAgentError(
            {
              code: "multi_actions_error",
              message: getUserFacingLLMErrorMessage(type, metadata),
              metadata: null,
            },
            errorDustRunId
          );
          return null;
        }

        // Throw to let Temporal handle the retry via its retry policy.
        throw new Error(
          `LLM error (${type}): ${getUserFacingLLMErrorMessage(type, metadata)}`
        );
      }
      case "shouldReturnNull":
        return null;
      default:
        assertNever(error);
    }
  }

  const { dustRunId, nativeChainOfThought, output } =
    getOutputFromActionResponse.value;

  // Create a new object to avoid mutation
  const updatedFunctionCallStepContentIds = { ...functionCallStepContentIds };

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

    const chainOfThought =
      (nativeChainOfThought || contentParser.getChainOfThought()) ?? "";

    const completedTs = Date.now();

    const updatedAgentMessage = {
      ...agentMessage,
      chainOfThought: (agentMessage.chainOfThought ?? "") + chainOfThought,
      content: (agentMessage.content ?? "") + processedContent,
      completedTs,
      status: "succeeded",
      completionDurationMs: getCompletionDuration(
        agentMessage.created,
        completedTs,
        agentMessage.actions
      ),
      prunedContext: agentMessageRow.prunedContext ?? false,
    } satisfies AgentMessageType;

    await updateResourceAndPublishEvent(auth, {
      event: {
        type: "agent_message_success",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        message: updatedAgentMessage,
        // TODO(OBSERVABILITY 2025-11-04): Create a row in run with the associated usage.
        runIds: [...runIds, dustRunId],
      },
      agentMessageRow,
      conversation,
      step,
      modelInteractionDurationMs:
        modelInteractionEndDate - modelInteractionStartDate,
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
        timeFrame: null,
        jsonSchema: null,
        secretName: null,
        dustProject: null,
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
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
    runId: dustRunId,
    functionCallStepContentIds: updatedFunctionCallStepContentIds,
    stepContexts,
  };
}
