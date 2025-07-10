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
  AgentActionSpecificEvent,
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
import { constructPromptMultiActions } from "@app/lib/api/assistant/generation";
import { getJITServers } from "@app/lib/api/assistant/jit_actions";
import { listAttachments } from "@app/lib/api/assistant/jit_utils";
import { isLegacyAgentConfiguration } from "@app/lib/api/assistant/legacy_agent";
import { renderConversationForModel } from "@app/lib/api/assistant/preprocessing";
import config from "@app/lib/api/config";
import { getRedisClient } from "@app/lib/api/redis";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { AgentStepContentModel } from "@app/lib/models/assistant/agent_step_content";
import { cloneBaseConfig, getDustProdAction } from "@app/lib/registry";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import type {
  AgentActionsEvent,
  AgentActionSuccessEvent,
  AgentChainOfThoughtEvent,
  AgentConfigurationType,
  AgentContentEvent,
  AgentErrorEvent,
  AgentGenerationCancelledEvent,
  AgentMessageSuccessEvent,
  AgentMessageType,
  AgentStepContentEvent,
  ConversationType,
  GenerationCancelEvent,
  GenerationSuccessEvent,
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
} from "@app/types/assistant/agent_message_content";
import type { TextContentType } from "@app/types/assistant/agent_message_content";

const CANCELLATION_CHECK_INTERVAL = 500;
const MAX_ACTIONS_PER_STEP = 16;

// This interface is used to execute an agent. It is not in charge of creating the AgentMessage,
// nor updating it (responsibility of the caller based on the emitted events).
export async function* runAgent(
  auth: Authenticator,
  configuration: LightAgentConfigurationType,
  conversation: ConversationType,
  userMessage: UserMessageType,
  agentMessage: AgentMessageType
): AsyncGenerator<
  | AgentErrorEvent
  | AgentActionSpecificEvent
  | AgentActionSuccessEvent
  | GenerationTokensEvent
  | AgentGenerationCancelledEvent
  | AgentMessageSuccessEvent,
  void
> {
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

  const stream = runMultiActionsAgentLoop(
    auth,
    fullConfiguration,
    conversation,
    userMessage,
    agentMessage
  );

  for await (const event of stream) {
    yield event;
  }
}

async function* runMultiActionsAgentLoop(
  auth: Authenticator,
  configuration: AgentConfigurationType,
  conversation: ConversationType,
  userMessage: UserMessageType,
  agentMessage: AgentMessageType
): AsyncGenerator<
  | AgentErrorEvent
  | AgentActionSpecificEvent
  | AgentActionSuccessEvent
  | GenerationTokensEvent
  | AgentGenerationCancelledEvent
  | AgentMessageSuccessEvent
> {
  const now = Date.now();

  const isLegacyAgent = isLegacyAgentConfiguration(configuration);
  const maxStepsPerRun = isLegacyAgent ? 1 : configuration.maxStepsPerRun;

  // Citations references offset kept up to date across steps.
  let citationsRefsOffset = 0;

  let processedContent = "";
  const runIds = [];

  // Track step content IDs by function call ID for later use in actions.
  const functionCallStepContentIds: Record<string, ModelId> = {};

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

    let isAnthropicOverloaded = false;
    do {
      const loopIterationStream = runMultiActionsAgent(auth, {
        agentConfiguration: configuration,
        conversation,
        userMessage,
        agentMessage,
        agentActions: actions,
        isLastGenerationIteration,
        isLegacyAgent,
      });

      for await (const event of loopIterationStream) {
        switch (event.type) {
          case "agent_error":
            const { category, publicMessage } = categorizeAgentErrorMessage(
              event.error
            );

            localLogger.error(
              {
                elapsedTime: Date.now() - now,
                error: event.error,
                publicErrorMessage: publicMessage,
              },
              "Error running multi-actions agent."
            );
            if (category === "anthropic_overloaded") {
              isAnthropicOverloaded = true;
              break;
            }
            yield {
              ...event,
              error: { ...event.error, message: publicMessage },
            };
            return;
          case "agent_actions":
            runIds.push(event.runId);

            localLogger.info(
              {
                elapsed: Date.now() - now,
              },
              "[ASSISTANT_TRACE] Action inputs generation"
            );

            // We received the actions to run, but will enforce a limit on the number of actions (16)
            // which is very high. Over that the latency will just be too high. This is a guardrail
            // against the model outputting something unreasonable.
            event.actions = event.actions.slice(0, MAX_ACTIONS_PER_STEP);

            const eventStreamGenerators = event.actions.map(
              ({ action, inputs, functionCallId }, index) => {
                // Find the step content ID for this function call
                const stepContentId = functionCallId
                  ? functionCallStepContentIds[functionCallId]
                  : undefined;

                return runAction(auth, {
                  configuration,
                  actionConfiguration: action,
                  conversation,
                  agentMessage,
                  inputs,
                  functionCallId,
                  step: i,
                  stepActionIndex: index,
                  stepActions: event.actions.map((a) => a.action),
                  citationsRefsOffset,
                  stepContentId,
                });
              }
            );

            const eventStreamPromises = eventStreamGenerators.map((gen) =>
              gen.next()
            );
            while (eventStreamPromises.length > 0) {
              const winner = await Promise.race(
                eventStreamPromises.map(async (p, i) => {
                  return { v: await p, offset: i };
                })
              );
              if (winner.v.done) {
                eventStreamGenerators.splice(winner.offset, 1);
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                eventStreamPromises.splice(winner.offset, 1);
              } else {
                eventStreamPromises[winner.offset] =
                  eventStreamGenerators[winner.offset].next();
                yield winner.v.value;
              }
            }

            // After we are done running actions, we update the inter-step refsOffset.
            for (let j = 0; j < event.actions.length; j++) {
              citationsRefsOffset += getCitationsCount({
                agentConfiguration: configuration,
                stepActions: event.actions.map((a) => a.action),
                stepActionIndex: j,
              });
            }

            break;

          case "agent_message_content":
            processedContent += event.processedContent;
            break;

          case "agent_step_content":
            const stepContent = await AgentStepContentModel.create({
              workspaceId: conversation.owner.id,
              agentMessageId: agentMessage.agentMessageId,
              step: i,
              index: event.index,
              type: event.content.type,
              value: event.content,
              version: 0,
            });

            // If this is a function call step content, track its ID.
            if (
              event.content.type === "function_call" &&
              event.content.value.id
            ) {
              functionCallStepContentIds[event.content.value.id] =
                stepContent.id;
            }

            agentMessage.contents.push({
              step: i,
              content: event.content,
            });
            break;

          // Generation events
          case "generation_tokens":
            yield event;
            break;
          case "generation_cancel":
            yield {
              type: "agent_generation_cancelled",
              created: event.created,
              configurationId: configuration.sId,
              messageId: agentMessage.sId,
            } satisfies AgentGenerationCancelledEvent;
            return;
          case "generation_success":
            if (event.chainOfThought.length) {
              if (!agentMessage.chainOfThought) {
                agentMessage.chainOfThought = "";
              }
              agentMessage.chainOfThought += event.chainOfThought;
            }
            agentMessage.content = processedContent;
            agentMessage.status = "succeeded";

            runIds.push(event.runId);

            yield {
              type: "agent_message_success",
              created: Date.now(),
              configurationId: configuration.sId,
              messageId: agentMessage.sId,
              message: agentMessage,
              runIds: runIds,
            } satisfies AgentMessageSuccessEvent;
            return;

          case "agent_chain_of_thought":
            if (!agentMessage.chainOfThought) {
              agentMessage.chainOfThought = "";
            }
            agentMessage.chainOfThought += event.chainOfThought;
            // This event is not useful outside of the multi-actions loop, so we don't yield it.
            break;

          default:
            assertNever(event);
        }
      }
    } while (isAnthropicOverloaded);
  }
}

// This method is used by the multi-actions execution loop to pick the next action to execute and
// generate its inputs.
async function* runMultiActionsAgent(
  auth: Authenticator,
  {
    agentConfiguration,
    conversation,
    userMessage,
    agentMessage,
    agentActions,
    isLastGenerationIteration,
    isLegacyAgent,
  }: {
    agentConfiguration: AgentConfigurationType;
    conversation: ConversationType;
    userMessage: UserMessageType;
    agentMessage: AgentMessageType;
    agentActions: AgentActionConfigurationType[];
    isLastGenerationIteration: boolean;
    isLegacyAgent: boolean;
  }
): AsyncGenerator<
  | AgentErrorEvent
  | GenerationSuccessEvent
  | GenerationCancelEvent
  | GenerationTokensEvent
  | AgentActionsEvent
  | AgentChainOfThoughtEvent
  | AgentContentEvent
  | AgentStepContentEvent
> {
  const model = getSupportedModelConfig(agentConfiguration.model);

  if (!model) {
    yield {
      type: "agent_error",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      error: {
        code: "model_does_not_support_multi_actions",
        message:
          `The model you selected (${agentConfiguration.model.modelId}) ` +
          `does not support multi-actions.`,
        metadata: null,
      },
    };
    return;
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
      yield {
        type: "agent_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "build_spec_error",
          message: `Failed to build the specification for action ${a.sId},`,
          metadata: null,
        },
      } satisfies AgentErrorEvent;

      return;
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
    yield {
      type: "agent_error",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      error: {
        code: "conversation_render_error",
        message: `Error rendering conversation for model: ${modelConversationRes.error.message}`,
        metadata: null,
      },
    } satisfies AgentErrorEvent;

    return;
  }

  // Check that specifications[].name are unique. This can happen if the user overrides two actions
  // names with the same name (advanced settings). We return an actionable error if that's the case
  // as we want to keep that as an invariant when interacting with models.
  const seen = new Set<string>();
  for (const spec of specifications) {
    if (seen.has(spec.name)) {
      yield {
        type: "agent_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "duplicate_specification_name",
          message:
            `Duplicate action name in agent configuration: ${spec.name}. ` +
            "Your agents actions must have unique names.",
          metadata: null,
        },
      } satisfies AgentErrorEvent;

      return;
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
    yield {
      type: "agent_error",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      error: {
        code: "multi_actions_error",
        message: `Error running agent: [${res.error.type}] ${res.error.message}`,
        metadata: null,
      },
    } satisfies AgentErrorEvent;

    return;
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
  for await (const event of eventStream) {
    if (event.type === "function_call") {
      isGeneration = false;
    }

    if (event.type === "error") {
      yield* contentParser.flushTokens();
      yield {
        type: "agent_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "multi_actions_error",
          message: `Error running agent: ${event.content.message}`,
          metadata: null,
        },
      } satisfies AgentErrorEvent;
      return;
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
      yield* contentParser.flushTokens();
      yield {
        type: "generation_cancel",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
      } satisfies GenerationCancelEvent;
      return;
    }

    if (event.type === "tokens" && isGeneration) {
      rawContent += event.content.tokens.text;
      yield* contentParser.emitTokens(event.content.tokens.text);
    }

    if (event.type === "reasoning_tokens") {
      yield {
        type: "generation_tokens",
        classification: "chain_of_thought",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        text: event.content.tokens.text,
      } satisfies GenerationTokensEvent;
      nativeChainOfThought += event.content.tokens.text;
    }

    if (event.type === "reasoning_item") {
      yield {
        type: "generation_tokens",
        classification: "chain_of_thought",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        text: "\n\n",
      } satisfies GenerationTokensEvent;
      nativeChainOfThought += "\n\n";
    }

    if (event.type === "block_execution") {
      const e = event.content.execution[0][0];
      if (e.error) {
        yield* contentParser.flushTokens();
        yield {
          type: "agent_error",
          created: Date.now(),
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
          error: {
            code: "multi_actions_error",
            message: `Error running agent: ${e.error}`,
            metadata: null,
          },
        } satisfies AgentErrorEvent;
        return;
      }

      if (event.content.block_name === "MODEL" && e.value) {
        // Flush early as we know the generation is terminated here.
        yield* contentParser.flushTokens();

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
          yield {
            type: "agent_error",
            created: Date.now(),
            configurationId: agentConfiguration.sId,
            messageId: agentMessage.sId,
            error: {
              code: "multi_actions_error",
              message: "Received unparsable MODEL block.",
              metadata: null,
            },
          } satisfies AgentErrorEvent;
          return;
        }

        output = {
          actions: [],
          generation: null,
          contents: block.message.contents ?? [],
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
              yield {
                type: "agent_error",
                created: Date.now(),
                configurationId: agentConfiguration.sId,
                messageId: agentMessage.sId,
                error: {
                  code: "function_call_error",
                  message: `Error parsing function call arguments: ${error}`,
                  metadata: null,
                },
              } satisfies AgentErrorEvent;
              return;
            }
          }
        } else {
          output.generation = block.message.content ?? null;
        }
      }
    }
  }

  yield* contentParser.flushTokens();

  if (!output) {
    yield {
      type: "agent_error",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      error: {
        code: "multi_actions_error",
        message: "Agent execution didn't complete.",
        metadata: null,
      },
    } satisfies AgentErrorEvent;
    return;
  }

  for (const [i, content] of output.contents.entries()) {
    yield {
      type: "agent_step_content",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      index: i,
      content,
    } satisfies AgentStepContentEvent;
  }

  if (!output.actions.length) {
    const processedContent = contentParser.getContent() ?? "";
    if (!processedContent.length) {
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

    yield {
      type: "agent_message_content",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      content: rawContent,
      processedContent,
    } satisfies AgentContentEvent;
    yield {
      type: "generation_success",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      text: processedContent,
      runId: await dustRunId,
      chainOfThought,
    } satisfies GenerationSuccessEvent;

    return;
  }

  // We have actions.

  if (isLastGenerationIteration) {
    yield {
      type: "agent_error",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      error: {
        code: "tool_use_limit_reached",
        message:
          "The agent attempted to use too many tools. This model error can be safely retried.",
        metadata: null,
      },
    } satisfies AgentErrorEvent;
    return;
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
        yield {
          type: "agent_error",
          created: Date.now(),
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
          error: {
            code: "action_not_found",
            message:
              `The agent attempted to run an invalid action (no name). ` +
              `This model error can be safely retried.`,
            metadata: null,
          },
        } satisfies AgentErrorEvent;

        return;
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

          yield {
            type: "agent_error",
            created: Date.now(),
            configurationId: agentConfiguration.sId,
            messageId: agentMessage.sId,
            error: {
              code: "action_not_found",
              message:
                `The agent attempted to run an invalid action (${a.name}). ` +
                `This model error can be safely retried (no server).`,
              metadata: null,
            },
          } satisfies AgentErrorEvent;
          return;
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

  yield* contentParser.flushTokens();

  const chainOfThought =
    (nativeChainOfThought || contentParser.getChainOfThought()) ?? "";

  if (chainOfThought?.length) {
    yield {
      type: "agent_chain_of_thought",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      message: agentMessage,
      chainOfThought,
    };
  }

  // We emit the raw content that was generated before the tool
  // use to store it in the AgentMessageContent table.
  if (rawContent.length) {
    yield {
      type: "agent_message_content",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      content: rawContent,
      processedContent: contentParser.getContent() ?? "",
    } satisfies AgentContentEvent;
  }

  yield {
    type: "agent_actions",
    runId: await dustRunId,
    created: Date.now(),
    actions,
  } satisfies AgentActionsEvent;

  return;
}

async function* runAction(
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
  }
): AsyncGenerator<
  AgentActionSpecificEvent | AgentErrorEvent | AgentActionSuccessEvent,
  void
> {
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
          yield {
            type: "agent_error",
            created: event.created,
            configurationId: configuration.sId,
            messageId: agentMessage.sId,
            error: {
              code: event.error.code,
              message: event.error.message,
              metadata: event.error.metadata,
            },
          };
          return;

        case "tool_params":
          yield event;
          break;

        case "tool_success":
          yield {
            type: "agent_action_success",
            created: event.created,
            configurationId: configuration.sId,
            messageId: agentMessage.sId,
            action: event.action,
          };

          // We stitch the action into the agent message. The conversation is expected to include
          // the agentMessage object, updating this object will update the conversation as well.
          agentMessage.actions.push(event.action);
          break;

        case "tool_approve_execution":
          yield event;
          break;

        case "tool_notification":
          yield event;
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
