import type {
  AgentActionConfigurationType,
  AgentActionsEvent,
  AgentActionSpecification,
  AgentActionSpecificEvent,
  AgentActionSuccessEvent,
  AgentChainOfThoughtEvent,
  AgentConfigurationType,
  AgentErrorEvent,
  AgentGenerationCancelledEvent,
  AgentGenerationSuccessEvent,
  AgentMessageSuccessEvent,
  AgentMessageType,
  ConversationType,
  DustAppRunTokensEvent,
  GenerationCancelEvent,
  GenerationSuccessEvent,
  GenerationTokensEvent,
  LightAgentConfigurationType,
  ModelConfigurationType,
  UserMessageType,
} from "@dust-tt/types";
import {
  assertNever,
  cloneBaseConfig,
  DustProdActionRegistry,
  isBrowseConfiguration,
  isDustAppRunConfiguration,
  isProcessConfiguration,
  isRetrievalConfiguration,
  isTablesQueryConfiguration,
  isVisualizationConfiguration,
  isWebsearchConfiguration,
  removeNulls,
  SUPPORTED_MODEL_CONFIGS,
} from "@dust-tt/types";
import { escapeRegExp } from "lodash";

import { runActionStreamed } from "@app/lib/actions/server";
import { getRunnerforActionConfiguration } from "@app/lib/api/assistant/actions/runners";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import {
  constructPromptMultiActions,
  renderConversationForModelMultiActions,
} from "@app/lib/api/assistant/generation";
import { isLegacyAgentConfiguration } from "@app/lib/api/assistant/legacy_agent";
import type { Authenticator } from "@app/lib/auth";
import { redisClient } from "@app/lib/redis";
import logger from "@app/logger/logger";

const CANCELLATION_CHECK_INTERVAL = 500;
const MAX_ACTIONS_PER_STEP = 16;

// This interface is used to execute an agent. It is not in charge of creating the AgentMessage,
// nor updating it (responsability of the caller based on the emitted events).
export async function* runAgent(
  auth: Authenticator,
  configuration: LightAgentConfigurationType,
  conversation: ConversationType,
  userMessage: UserMessageType,
  agentMessage: AgentMessageType
): AsyncGenerator<
  | AgentErrorEvent
  | AgentActionsEvent
  | AgentActionSpecificEvent
  | AgentActionSuccessEvent
  | GenerationTokensEvent
  | AgentGenerationSuccessEvent
  | AgentGenerationCancelledEvent
  | AgentMessageSuccessEvent
  | AgentChainOfThoughtEvent,
  void
> {
  const fullConfiguration = await getAgentConfiguration(
    auth,
    configuration.sId
  );
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

export async function* runMultiActionsAgentLoop(
  auth: Authenticator,
  configuration: AgentConfigurationType,
  conversation: ConversationType,
  userMessage: UserMessageType,
  agentMessage: AgentMessageType
): AsyncGenerator<
  | AgentErrorEvent
  | AgentActionsEvent
  | AgentActionSpecificEvent
  | AgentActionSuccessEvent
  | GenerationTokensEvent
  | AgentGenerationSuccessEvent
  | AgentGenerationCancelledEvent
  | AgentMessageSuccessEvent
  | AgentChainOfThoughtEvent
> {
  const now = Date.now();

  const isLegacyAgent = isLegacyAgentConfiguration(configuration);
  const maxToolsUsePerRun = isLegacyAgent ? 1 : configuration.maxToolsUsePerRun;

  // Citations references offset kept up to date across steps.
  let citationsRefsOffset = 0;

  for (let i = 0; i < maxToolsUsePerRun + 1; i++) {
    const localLogger = logger.child({
      workspaceId: conversation.owner.sId,
      conversationId: conversation.sId,
      multiActionLoopIteration: i,
    });

    localLogger.info("Starting multi-action loop iteration");

    const isLastGenerationIteration = i === maxToolsUsePerRun;

    const actions =
      // If we already executed the maximum number of actions, we don't run any more.
      // This will force the agent to run the generation.
      isLastGenerationIteration
        ? []
        : // Otherwise, we let the agent decide which action to run (if any).
          configuration.actions;

    const loopIterationStream = runMultiActionsAgent(auth, {
      agentConfiguration: configuration,
      conversation,
      userMessage,
      agentMessage,
      availableActions: actions,
      isLastGenerationIteration,
      isLegacyAgent,
    });

    for await (const event of loopIterationStream) {
      switch (event.type) {
        case "agent_error":
          localLogger.error(
            {
              elapsedTime: Date.now() - now,
              error: event.error,
            },
            "Error running multi-actions agent."
          );
          yield event;
          return;
        case "agent_actions":
          localLogger.info(
            {
              elapsed: Date.now() - now,
            },
            "[ASSISTANT_TRACE] Action inputs generation"
          );

          // We received the actions to run, but will enforce a limit on the number of actions (16)
          // which is very high. Over that the latency will just be too high. This is a guardrail
          // against the model outputing something unreasonable.
          event.actions = event.actions.slice(0, MAX_ACTIONS_PER_STEP);

          yield event;

          const eventStreamGenerators = event.actions.map(
            ({ action, inputs, functionCallId, specification }, index) => {
              return runAction(auth, {
                configuration,
                actionConfiguration: action,
                conversation,
                userMessage,
                agentMessage,
                inputs,
                specification,
                functionCallId,
                step: i,
                stepActionIndex: index,
                stepActions: event.actions.map((a) => a.action),
                citationsRefsOffset,
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

          // After we are done running actions we update the inter step refsOffset.
          event.actions.forEach(({ action }) => {
            citationsRefsOffset += getRunnerforActionConfiguration(
              action
            ).getCitationsCount({
              agentConfiguration: configuration,
              stepActions: event.actions.map((a) => a.action),
            });
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
            yield {
              type: "agent_chain_of_thought",
              created: event.created,
              configurationId: configuration.sId,
              messageId: agentMessage.sId,
              message: agentMessage,
              chainOfThought: event.chainOfThought,
            };
            agentMessage.chainOfThoughts.push(event.chainOfThought);
          }
          yield {
            type: "agent_generation_success",
            created: event.created,
            configurationId: configuration.sId,
            messageId: agentMessage.sId,
            text: event.text,
            runId: event.runId,
          } satisfies AgentGenerationSuccessEvent;

          agentMessage.content = event.text;
          agentMessage.status = "succeeded";
          yield {
            type: "agent_message_success",
            created: Date.now(),
            configurationId: configuration.sId,
            messageId: agentMessage.sId,
            message: agentMessage,
          };
          return;

        case "agent_chain_of_thought":
          agentMessage.chainOfThoughts.push(event.chainOfThought);
          yield event;
          break;

        default:
          assertNever(event);
      }
    }
  }
}

// This method is used by the multi-actions execution loop to pick the next action
// to execute and generate its inputs.
export async function* runMultiActionsAgent(
  auth: Authenticator,
  {
    agentConfiguration,
    conversation,
    userMessage,
    agentMessage,
    availableActions,
    isLastGenerationIteration,
    isLegacyAgent,
  }: {
    agentConfiguration: AgentConfigurationType;
    conversation: ConversationType;
    userMessage: UserMessageType;
    agentMessage: AgentMessageType;
    availableActions: AgentActionConfigurationType[];
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
> {
  const model = SUPPORTED_MODEL_CONFIGS.find(
    (m) =>
      m.modelId === agentConfiguration.model.modelId &&
      m.providerId === agentConfiguration.model.providerId
  );

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
      },
    };
    return;
  }

  let fallbackPrompt = "You are a conversational assistant";
  if (agentConfiguration.actions.length) {
    fallbackPrompt += " with access to tool use.";
  } else {
    fallbackPrompt += ".";
  }

  const prompt = await constructPromptMultiActions(auth, {
    userMessage,
    agentConfiguration,
    fallbackPrompt,
    model,
    hasAvailableActions: !!availableActions.length,
  });

  const MIN_GENERATION_TOKENS = 2048;

  // Turn the conversation into a digest that can be presented to the model.
  const modelConversationRes = await renderConversationForModelMultiActions({
    conversation,
    model,
    prompt,
    allowedTokenCount: model.contextSize - MIN_GENERATION_TOKENS,
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
      },
    } satisfies AgentErrorEvent;

    return;
  }

  const specifications: AgentActionSpecification[] = [];
  for (const a of availableActions) {
    const specRes = await getRunnerforActionConfiguration(a).buildSpecification(
      auth,
      {
        name: a.name,
        description: a.description,
      }
    );

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
        },
      } satisfies AgentErrorEvent;

      return;
    }

    // Truncate the description to 1024 characters
    specRes.value.description = specRes.value.description.slice(0, 1024);

    specifications.push(specRes.value);
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
            `Duplicate action name in assistant configuration: ${spec.name}. ` +
            "Your assistants actions must have unique names.",
        },
      } satisfies AgentErrorEvent;

      return;
    }
    seen.add(spec.name);
  }

  const config = cloneBaseConfig(
    DustProdActionRegistry["assistant-v2-multi-actions-agent"].config
  );
  if (isLegacyAgent) {
    config.MODEL.function_call =
      specifications.length === 1 ? specifications[0].name : null;
  } else {
    config.MODEL.function_call = specifications.length === 0 ? null : "auto";
  }
  config.MODEL.provider_id = model.providerId;
  config.MODEL.model_id = model.modelId;
  config.MODEL.temperature = agentConfiguration.model.temperature;

  const res = await runActionStreamed(
    auth,
    "assistant-v2-multi-actions-agent",
    config,
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
        message: `Error running multi-actions agent action: [${res.error.type}] ${res.error.message}`,
      },
    } satisfies AgentErrorEvent;

    return;
  }

  const { eventStream, dustRunId } = res.value;
  const output: {
    actions: Array<{
      functionCallId: string | null;
      name: string | null;
      arguments: Record<string, string | boolean | number> | null;
    }>;
    generation: string | null;
  } = {
    actions: [],
    generation: null,
  };

  let shouldYieldCancel = false;
  let lastCheckCancellation = Date.now();
  const redis = await redisClient();
  let isGeneration = true;
  const tokenEmitter = new TokenEmitter(
    agentConfiguration,
    agentMessage,
    model.delimitersConfiguration
  );

  try {
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

    for await (const event of eventStream) {
      if (event.type === "function_call") {
        isGeneration = false;
      }

      if (event.type === "error") {
        yield* tokenEmitter.flushTokens();
        yield {
          type: "agent_error",
          created: Date.now(),
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
          error: {
            code: "multi_actions_error",
            message: `Error running assistant: ${event.content.message}`,
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
        yield* tokenEmitter.flushTokens();
        yield {
          type: "generation_cancel",
          created: Date.now(),
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
        } satisfies GenerationCancelEvent;
        return;
      }

      if (event.type === "tokens" && isGeneration) {
        yield* tokenEmitter.emitTokens(event);
      }

      if (event.type === "block_execution") {
        const e = event.content.execution[0][0];
        if (e.error) {
          yield* tokenEmitter.flushTokens();
          yield {
            type: "agent_error",
            created: Date.now(),
            configurationId: agentConfiguration.sId,
            messageId: agentMessage.sId,
            error: {
              code: "multi_actions_error",
              message: `Error running assistant: ${e.error}`,
            },
          } satisfies AgentErrorEvent;
          return;
        }

        if (event.content.block_name === "OUTPUT" && e.value) {
          // Flush early as we know the generation is terminated here.
          yield* tokenEmitter.flushTokens();

          const v = e.value as any;
          if ("actions" in v) {
            output.actions = v.actions;
          }
          if ("generation" in v) {
            output.generation = v.generation;
          }
          break;
        }
      }
    }
  } finally {
    await redis.quit();
  }

  yield* tokenEmitter.flushTokens();

  if (!output.actions.length) {
    if (typeof output.generation === "string") {
      yield {
        type: "generation_success",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        text: tokenEmitter.getContent() ?? "",
        runId: await dustRunId,
        chainOfThought: tokenEmitter.getChainOfThought() ?? "",
      } satisfies GenerationSuccessEvent;
    } else {
      yield {
        type: "agent_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "no_action_or_generation_found",
          message: "No action or generation found",
        },
      } satisfies AgentErrorEvent;
    }
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
          "The assistant attempted to use too many tools. This model error can be safely retried.",
      },
    } satisfies AgentErrorEvent;
    return;
  }

  const actions: AgentActionsEvent["actions"] = [];
  const agentActions = agentConfiguration.actions;

  for (const a of output.actions) {
    const action = agentActions.find((ac) => ac.name === a.name);

    if (!action) {
      logger.error(
        {
          workspaceId: conversation.owner.sId,
          conversationId: conversation.sId,
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
          actionName: a.name,
        },
        "Model attempted to run an action that is not part of the agent configuration."
      );
      yield {
        type: "agent_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "action_not_found",
          message: `The assistant attempted to run an invalid action (${a.name}). This model error can be safely retried.`,
        },
      } satisfies AgentErrorEvent;
      return;
    }

    const spec = specifications.find((s) => s.name === a.name) ?? null;

    actions.push({
      action,
      inputs: a.arguments ?? {},
      specification: spec,
      functionCallId: a.functionCallId ?? null,
    });
  }

  yield* tokenEmitter.flushTokens();

  const chainOfThought = tokenEmitter.getChainOfThought();
  const content = tokenEmitter.getContent();

  if (chainOfThought?.length || content?.length) {
    yield {
      type: "agent_chain_of_thought",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      message: agentMessage,

      // All content here was generated before a tool use and is not proper generation content
      // and can therefore be safely assumed to be reflection from the model before using a tool.
      // In practice, we should never have both chainOfThought and content.
      // It is not completely impossible that eg Anthropic decides to emit part of the
      // CoT between `<thinking>` XML tags and the rest outside of any tag.
      chainOfThought: removeNulls([chainOfThought, content]).join("\n"),
    };
  }

  yield {
    type: "agent_actions",
    runId: await dustRunId,
    created: Date.now(),
    actions,
  };

  return;
}

async function* runAction(
  auth: Authenticator,
  {
    configuration,
    actionConfiguration,
    conversation,
    userMessage,
    agentMessage,
    inputs,
    specification,
    functionCallId,
    step,
    stepActionIndex,
    stepActions,
    citationsRefsOffset,
  }: {
    configuration: AgentConfigurationType;
    actionConfiguration: AgentActionConfigurationType;
    conversation: ConversationType;
    userMessage: UserMessageType;
    agentMessage: AgentMessageType;
    inputs: Record<string, string | boolean | number>;
    specification: AgentActionSpecification | null;
    functionCallId: string | null;
    step: number;
    stepActionIndex: number;
    stepActions: AgentActionConfigurationType[];
    citationsRefsOffset: number;
  }
): AsyncGenerator<
  AgentActionSpecificEvent | AgentErrorEvent | AgentActionSuccessEvent,
  void
> {
  const now = Date.now();

  if (isRetrievalConfiguration(actionConfiguration)) {
    const eventStream = getRunnerforActionConfiguration(
      actionConfiguration
    ).run(
      auth,
      {
        agentConfiguration: configuration,
        conversation,
        agentMessage,
        rawInputs: inputs,
        functionCallId,
        step,
      },
      {
        stepActionIndex,
        stepActions,
        citationsRefsOffset,
      }
    );

    for await (const event of eventStream) {
      switch (event.type) {
        case "retrieval_params":
          yield event;
          break;
        case "retrieval_error":
          yield {
            type: "agent_error",
            created: event.created,
            configurationId: configuration.sId,
            messageId: agentMessage.sId,
            error: {
              code: event.error.code,
              message: event.error.message,
            },
          };
          return;
        case "retrieval_success":
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

        default:
          assertNever(event);
      }
    }
  } else if (isDustAppRunConfiguration(actionConfiguration)) {
    if (!specification) {
      logger.error(
        {
          workspaceId: conversation.owner.sId,
          conversationId: conversation.sId,
          elapsedTime: Date.now() - now,
        },
        "No specification found for Dust app run action."
      );
      yield {
        type: "agent_error",
        created: now,
        configurationId: configuration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "parameters_generation_error",
          message: "No specification found for Dust app run action.",
        },
      };
      return;
    }

    const eventStream = getRunnerforActionConfiguration(
      actionConfiguration
    ).run(
      auth,
      {
        agentConfiguration: configuration,
        conversation,
        agentMessage,
        rawInputs: inputs,
        functionCallId,
        step,
      },
      {
        spec: specification,
      }
    );

    for await (const event of eventStream) {
      switch (event.type) {
        case "dust_app_run_params":
          yield event;
          break;
        case "dust_app_run_error":
          yield {
            type: "agent_error",
            created: event.created,
            configurationId: configuration.sId,
            messageId: agentMessage.sId,
            error: {
              code: event.error.code,
              message: event.error.message,
            },
          };
          return;
        case "dust_app_run_block":
          yield event;
          break;
        case "dust_app_run_success":
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

        default:
          assertNever(event);
      }
    }
  } else if (isTablesQueryConfiguration(actionConfiguration)) {
    const eventStream = getRunnerforActionConfiguration(
      actionConfiguration
    ).run(auth, {
      agentConfiguration: configuration,
      conversation,
      agentMessage,
      rawInputs: inputs,
      functionCallId,
      step,
    });

    for await (const event of eventStream) {
      switch (event.type) {
        case "tables_query_params":
        case "tables_query_output":
          yield event;
          break;
        case "tables_query_error":
          yield {
            type: "agent_error",
            created: event.created,
            configurationId: configuration.sId,
            messageId: agentMessage.sId,
            error: {
              code: event.error.code,
              message: event.error.message,
            },
          };
          return;
        case "tables_query_success":
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
        default:
          assertNever(event);
      }
    }
  } else if (isProcessConfiguration(actionConfiguration)) {
    const eventStream = getRunnerforActionConfiguration(
      actionConfiguration
    ).run(auth, {
      agentConfiguration: configuration,
      conversation,
      userMessage,
      agentMessage,
      rawInputs: inputs,
      functionCallId,
      step,
    });

    for await (const event of eventStream) {
      switch (event.type) {
        case "process_params":
          yield event;
          break;
        case "process_error":
          yield {
            type: "agent_error",
            created: event.created,
            configurationId: configuration.sId,
            messageId: agentMessage.sId,
            error: {
              code: event.error.code,
              message: event.error.message,
            },
          };
          return;
        case "process_success":
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

        default:
          assertNever(event);
      }
    }
  } else if (isWebsearchConfiguration(actionConfiguration)) {
    const eventStream = getRunnerforActionConfiguration(
      actionConfiguration
    ).run(
      auth,
      {
        agentConfiguration: configuration,
        conversation,
        agentMessage,
        rawInputs: inputs,
        functionCallId: null,
        step,
      },
      {
        stepActionIndex,
        stepActions,
        citationsRefsOffset,
      }
    );

    for await (const event of eventStream) {
      switch (event.type) {
        case "websearch_params":
          yield event;
          break;
        case "websearch_error":
          yield {
            type: "agent_error",
            created: event.created,
            configurationId: configuration.sId,
            messageId: agentMessage.sId,
            error: {
              code: event.error.code,
              message: event.error.message,
            },
          };
          return;
        case "websearch_success":
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

        default:
          assertNever(event);
      }
    }
  } else if (isBrowseConfiguration(actionConfiguration)) {
    const eventStream = getRunnerforActionConfiguration(
      actionConfiguration
    ).run(auth, {
      agentConfiguration: configuration,
      conversation,
      agentMessage,
      rawInputs: inputs,
      functionCallId: null,
      step,
    });

    for await (const event of eventStream) {
      switch (event.type) {
        case "browse_params":
          yield event;
          break;
        case "browse_error":
          yield {
            type: "agent_error",
            created: event.created,
            configurationId: configuration.sId,
            messageId: agentMessage.sId,
            error: {
              code: event.error.code,
              message: event.error.message,
            },
          };
          return;
        case "browse_success":
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

        default:
          assertNever(event);
      }
    }
  } else if (isVisualizationConfiguration(actionConfiguration)) {
    const eventStream = getRunnerforActionConfiguration(
      actionConfiguration
    ).run(auth, {
      agentConfiguration: configuration,
      conversation,
      agentMessage,
      rawInputs: inputs,
      functionCallId,
      step,
    });

    for await (const event of eventStream) {
      switch (event.type) {
        case "visualization_params":
          yield event;
          break;
        case "visualization_error":
          yield {
            type: "agent_error",
            created: event.created,
            configurationId: configuration.sId,
            messageId: agentMessage.sId,
            error: {
              code: event.error.code,
              message: event.error.message,
            },
          };
          return;
        case "visualization_success":
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

        default:
          assertNever(event);
      }
    }
  } else {
    assertNever(actionConfiguration);
  }
}

export class TokenEmitter {
  private buffer: string = "";
  private content: string = "";
  private chainOfThought: string = "";
  private chainOfToughtDelimitersOpened: number = 0;
  private swallowDelimitersOpened: number = 0;
  private pattern?: RegExp;
  private incompleteDelimiterPattern?: RegExp;
  private specByDelimiter: Record<
    string,
    {
      type: "opening_delimiter" | "closing_delimiter";
      isChainOfThought: boolean;
      swallow: boolean;
    }
  >;

  constructor(
    private agentConfiguration: AgentConfigurationType,
    private agentMessage: AgentMessageType,
    delimitersConfiguration: ModelConfigurationType["delimitersConfiguration"]
  ) {
    this.buffer = "";
    this.content = "";
    this.chainOfThought = "";
    this.chainOfToughtDelimitersOpened = 0;

    // Ensure no duplicate delimiters.
    const allDelimitersArray =
      delimitersConfiguration?.delimiters.flatMap(
        ({ openingPattern, closingPattern }) => [
          escapeRegExp(openingPattern),
          escapeRegExp(closingPattern),
        ]
      ) ?? [];

    if (allDelimitersArray.length !== new Set(allDelimitersArray).size) {
      throw new Error("Duplicate delimiters in the configuration");
    }

    // Store mapping of delimiters to their spec.
    this.specByDelimiter =
      delimitersConfiguration?.delimiters.reduce(
        (
          acc,
          { openingPattern, closingPattern, isChainOfThought, swallow }
        ) => {
          acc[openingPattern] = {
            type: "opening_delimiter" as const,
            isChainOfThought,
            swallow,
          };
          acc[closingPattern] = {
            type: "closing_delimiter" as const,
            isChainOfThought,
            swallow,
          };
          return acc;
        },
        {} as TokenEmitter["specByDelimiter"]
      ) ?? {};

    // Store the regex pattern that match any of the delimiters.
    this.pattern = allDelimitersArray.length
      ? new RegExp(allDelimitersArray.join("|"))
      : undefined;

    // Store the regex pattern that match incomplete delimiters.
    this.incompleteDelimiterPattern =
      delimitersConfiguration?.incompleteDelimiterRegex;
  }

  async *flushTokens({
    upTo,
  }: {
    upTo?: number;
  } = {}): AsyncGenerator<GenerationTokensEvent> {
    if (!this.buffer.length) {
      return;
    }
    if (!this.swallowDelimitersOpened) {
      const text =
        upTo === undefined ? this.buffer : this.buffer.substring(0, upTo);

      yield {
        type: "generation_tokens",
        created: Date.now(),
        configurationId: this.agentConfiguration.sId,
        messageId: this.agentMessage.sId,
        text,
        classification: this.chainOfToughtDelimitersOpened
          ? "chain_of_thought"
          : "tokens",
      };

      if (this.chainOfToughtDelimitersOpened) {
        this.chainOfThought += text;
      } else {
        this.content += text;
      }
    }

    this.buffer = upTo === undefined ? "" : this.buffer.substring(upTo);
  }

  async *emitTokens(
    event: DustAppRunTokensEvent
  ): AsyncGenerator<GenerationTokensEvent> {
    // Add text of the new event to the buffer.
    this.buffer += event.content.tokens.text;
    if (!this.pattern) {
      yield* this.flushTokens();
      return;
    }

    if (this.incompleteDelimiterPattern?.test(this.buffer)) {
      // Wait for the next event to complete the delimiter.
      return;
    }

    let match: RegExpExecArray | null;
    while ((match = this.pattern.exec(this.buffer))) {
      const del = match[0];
      const index = match.index;

      // Emit text before the delimiter as 'text' or 'chain_of_thought'
      if (index > 0) {
        yield* this.flushTokens({ upTo: index });
      }

      const {
        type: classification,
        isChainOfThought,
        swallow,
      } = this.specByDelimiter[del];

      if (!classification) {
        throw new Error(`Unknown delimiter: ${del}`);
      }

      if (swallow) {
        if (classification === "opening_delimiter") {
          this.swallowDelimitersOpened += 1;
        } else {
          this.swallowDelimitersOpened -= 1;
        }
      }

      if (isChainOfThought) {
        if (classification === "opening_delimiter") {
          this.chainOfToughtDelimitersOpened += 1;
        } else {
          this.chainOfToughtDelimitersOpened -= 1;
          if (this.chainOfToughtDelimitersOpened === 0) {
            // The chain of thought tag is closed.
            // Yield a newline in the chain of thought to separate the different blocks.
            const separator = "\n";
            yield {
              type: "generation_tokens",
              created: Date.now(),
              configurationId: this.agentConfiguration.sId,
              messageId: this.agentMessage.sId,
              text: separator,
              classification: "chain_of_thought",
            };
            this.chainOfThought += separator;
          }
        }
      }

      // Emit the delimiter.
      yield {
        type: "generation_tokens",
        created: Date.now(),
        configurationId: this.agentConfiguration.sId,
        messageId: this.agentMessage.sId,
        text: del,
        classification,
      } satisfies GenerationTokensEvent;

      // Update the buffer
      this.buffer = this.buffer.substring(del.length);
    }

    // Emit the remaining text/chain_of_thought.
    yield* this.flushTokens();
  }

  getContent(): string | null {
    return this.content.length ? this.content : null;
  }

  getChainOfThought(): string | null {
    return this.chainOfThought.length ? this.chainOfThought : null;
  }
}
