import type {
  AgentActionConfigurationType,
  AgentActionsEvent,
  AgentActionSpecification,
  AgentActionSpecificEvent,
  AgentActionSuccessEvent,
  AgentConfigurationType,
  AgentErrorEvent,
  AgentGenerationCancelledEvent,
  AgentGenerationSuccessEvent,
  AgentMessageSuccessEvent,
  AgentMessageType,
  ConversationType,
  GenerationCancelEvent,
  GenerationSuccessEvent,
  GenerationTokensEvent,
  LightAgentConfigurationType,
  UserMessageType,
} from "@dust-tt/types";
import {
  assertNever,
  CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG,
  cloneBaseConfig,
  DustProdActionRegistry,
  isDustAppRunConfiguration,
  isProcessConfiguration,
  isRetrievalConfiguration,
  isTablesQueryConfiguration,
  SUPPORTED_MODEL_CONFIGS,
} from "@dust-tt/types";

import { runActionStreamed } from "@app/lib/actions/server";
import {
  generateProcessSpecification,
  runProcess,
} from "@app/lib/api/assistant/actions/process";
import {
  generateRetrievalSpecification,
  runRetrieval,
} from "@app/lib/api/assistant/actions/retrieval";
import { getRunnerforActionConfiguration } from "@app/lib/api/assistant/actions/runners";
import {
  generateTablesQuerySpecification,
  runTablesQuery,
} from "@app/lib/api/assistant/actions/tables_query";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import {
  constructPromptMultiActions,
  renderConversationForModelMultiActions,
} from "@app/lib/api/assistant/generation";
import { runLegacyAgent } from "@app/lib/api/assistant/legacy_agent";
import { isLegacyAgent } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { redisClient } from "@app/lib/redis";
import logger from "@app/logger/logger";

const CANCELLATION_CHECK_INTERVAL = 500;

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
  | AgentActionSpecificEvent
  | AgentActionSuccessEvent
  | GenerationTokensEvent
  | AgentGenerationSuccessEvent
  | AgentGenerationCancelledEvent
  | AgentMessageSuccessEvent,
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

  const stream = isLegacyAgent(fullConfiguration)
    ? runLegacyAgent(
        auth,
        fullConfiguration,
        conversation,
        userMessage,
        agentMessage
      )
    : runMultiActionsAgentLoop(
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
  | AgentActionSpecificEvent
  | AgentActionSuccessEvent
  | GenerationTokensEvent
  | AgentGenerationSuccessEvent
  | AgentGenerationCancelledEvent
  | AgentMessageSuccessEvent
> {
  const now = Date.now();

  for (let i = 0; i < configuration.maxToolsUsePerRun + 1; i++) {
    const localLogger = logger.child({
      workspaceId: conversation.owner.sId,
      conversationId: conversation.sId,
      multiActionLoopIteration: i,
    });

    localLogger.info("Starting multi-action loop iteration");

    const forcedAction = configuration.actions.find(
      (a) => a.forceUseAtIteration === i
    );
    const actions =
      // If we already executed the maximum number of actions, we don't run any more.
      // This will force the agent to run the generation.
      i === configuration.maxToolsUsePerRun
        ? []
        : // If we have a forced action, we only run this action.
        forcedAction
        ? [forcedAction]
        : // Otherwise, we let the agent decide which action to run (if any).
          configuration.actions;

    const loopIterationStream = runMultiActionsAgent(auth, {
      agentConfiguration: configuration,
      conversation,
      userMessage,
      agentMessage,
      availableActions: actions,
      forcedActionName: forcedAction?.name ?? undefined,
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

          const actionIndexByType: Record<string, number> = {};
          const eventStreamGenerators = event.actions.map(
            ({ action, inputs, functionCallId, specification }) => {
              const index = actionIndexByType[action.type] ?? 0;
              actionIndexByType[action.type] = index + 1;
              return runAction(auth, {
                configuration: configuration,
                actionConfiguration: action,
                conversation,
                userMessage,
                agentMessage,
                inputs,
                specification,
                functionCallId,
                step: i,
                indexForType: index,
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
          yield {
            type: "agent_generation_success",
            created: event.created,
            configurationId: configuration.sId,
            messageId: agentMessage.sId,
            text: event.text,
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
    forcedActionName,
  }: {
    agentConfiguration: AgentConfigurationType;
    conversation: ConversationType;
    userMessage: UserMessageType;
    agentMessage: AgentMessageType;
    availableActions: AgentActionConfigurationType[];
    forcedActionName?: string;
  }
): AsyncGenerator<
  | AgentErrorEvent
  | GenerationSuccessEvent
  | GenerationCancelEvent
  | GenerationTokensEvent
  | AgentActionsEvent
> {
  const prompt = await constructPromptMultiActions(
    auth,
    userMessage,
    agentConfiguration,
    "You are a conversational assistant with access to function calling."
  );

  const model =
    SUPPORTED_MODEL_CONFIGS.find(
      (m) =>
        m.modelId === agentConfiguration.model.modelId &&
        m.providerId === agentConfiguration.model.providerId &&
        m.supportsMultiActions
    ) ?? CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG;

  const MIN_GENERATION_TOKENS = 2048;

  // Turn the conversation into a digest that can be presented to the model.
  const modelConversationRes = await renderConversationForModelMultiActions({
    conversation,
    model,
    prompt,
    allowedTokenCount: model.contextSize - MIN_GENERATION_TOKENS,
  });

  if (modelConversationRes.isErr()) {
    return modelConversationRes;
  }

  const specifications: AgentActionSpecification[] = [];
  for (const a of availableActions) {
    if (isRetrievalConfiguration(a)) {
      const r = await generateRetrievalSpecification(auth, {
        actionConfiguration: a,
        name: a.name ?? undefined,
        description: a.description ?? undefined,
      });

      if (r.isErr()) {
        return r;
      }

      specifications.push(r.value);
    } else if (isTablesQueryConfiguration(a)) {
      const r = await generateTablesQuerySpecification(auth, {
        name: a.name ?? undefined,
        description: a.description ?? undefined,
      });

      if (r.isErr()) {
        return r;
      }

      specifications.push(r.value);
    } else if (isProcessConfiguration(a)) {
      const r = await generateProcessSpecification(auth, {
        actionConfiguration: a,
        name: a.name ?? undefined,
        description: a.description ?? undefined,
      });

      if (r.isErr()) {
        return r;
      }

      specifications.push(r.value);
    } else {
      const runner = getRunnerforActionConfiguration(a);

      const res = await runner.buildSpecification(auth, {
        name: a.name ?? undefined,
        description: a.description ?? undefined,
      });

      if (res.isErr()) {
        return res;
      }

      specifications.push(res.value);
    }
  }
  // not sure if the speicfications.push() is needed here TBD at review time.

  const config = cloneBaseConfig(
    DustProdActionRegistry["assistant-v2-multi-actions-agent"].config
  );
  config.MODEL.function_call =
    specifications.length === 0 ? null : forcedActionName ?? "auto";
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

  const { eventStream } = res.value;

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
        yield {
          type: "agent_error",
          created: Date.now(),
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
          error: {
            code: "multi_actions_error",
            message: `Error running multi-actions agent action: ${JSON.stringify(
              event,
              null,
              2
            )}`,
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
        yield {
          type: "generation_cancel",
          created: Date.now(),
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
        } satisfies GenerationCancelEvent;
        return;
      }

      if (event.type === "tokens" && isGeneration) {
        yield {
          type: "generation_tokens",
          created: Date.now(),
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
          text: event.content.tokens.text,
        } satisfies GenerationTokensEvent;
      }

      if (event.type === "block_execution") {
        const e = event.content.execution[0][0];
        if (e.error) {
          yield {
            type: "agent_error",
            created: Date.now(),
            configurationId: agentConfiguration.sId,
            messageId: agentMessage.sId,
            error: {
              code: "multi_actions_error",
              message: `Error running multi-actions agent action: ${e.error}`,
            },
          } satisfies AgentErrorEvent;
          return;
        }

        if (event.content.block_name === "MODEL" && e.value && isGeneration) {
          const m = e.value as {
            message: {
              content: string;
            };
          };
          yield {
            type: "generation_success",
            created: Date.now(),
            configurationId: agentConfiguration.sId,
            messageId: agentMessage.sId,
            text: m.message.content,
          } satisfies GenerationSuccessEvent;
          return;
        }

        if (event.content.block_name === "OUTPUT" && e.value) {
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

  if (!output.actions.length) {
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
    return;
  }

  const actions: AgentActionsEvent["actions"] = [];
  for (const a of output.actions) {
    const action = agentConfiguration.actions.find((ac) => ac.name === a.name);

    if (!action) {
      yield {
        type: "agent_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "action_not_found",
          message: `Action ${a.name} not found`,
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

  yield {
    type: "agent_actions",
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
    indexForType,
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
    indexForType: number;
  }
): AsyncGenerator<
  AgentActionSpecificEvent | AgentErrorEvent | AgentActionSuccessEvent,
  void
> {
  const now = Date.now();

  if (isRetrievalConfiguration(actionConfiguration)) {
    const eventStream = runRetrieval(auth, {
      configuration,
      actionConfiguration,
      conversation,
      agentMessage,
      rawInputs: inputs,
      functionCallId,
      step,
      // We allocate 32 refs per retrieval action.
      refsOffset: indexForType * 32,
    });

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
    const runner = getRunnerforActionConfiguration(actionConfiguration);

    const eventStream = runner.run(
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
    const eventStream = runTablesQuery(auth, {
      configuration,
      actionConfiguration,
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
    const eventStream = runProcess(auth, {
      configuration,
      actionConfiguration,
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
  } else {
    assertNever(actionConfiguration);
  }
}
