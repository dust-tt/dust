import type {
  AgentActionConfigurationType,
  AgentActionsEvent,
  AgentActionSpecification,
  AgentActionSpecificEvent,
  AgentActionSuccessEvent,
  AgentChainOfThoughtEvent,
  AgentConfigurationType,
  AgentContentEvent,
  AgentErrorEvent,
  AgentGenerationCancelledEvent,
  AgentMessageSuccessEvent,
  AgentMessageType,
  ConversationType,
  GenerationCancelEvent,
  GenerationSuccessEvent,
  GenerationTokensEvent,
  LightAgentConfigurationType,
  UserMessageType,
  WorkspaceType,
} from "@dust-tt/types";
import {
  assertNever,
  isBrowseConfiguration,
  isDustAppRunConfiguration,
  isProcessConfiguration,
  isRetrievalConfiguration,
  isTablesQueryConfiguration,
  isWebsearchConfiguration,
  SUPPORTED_MODEL_CONFIGS,
} from "@dust-tt/types";

import { runActionStreamed } from "@app/lib/actions/server";
import { getRunnerForActionConfiguration } from "@app/lib/api/assistant/actions/runners";
import {
  AgentMessageContentParser,
  getDelimitersConfiguration,
} from "@app/lib/api/assistant/agent_message_content_parser";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import {
  constructPromptMultiActions,
  renderConversationForModelMultiActions,
} from "@app/lib/api/assistant/generation";
import { isLegacyAgentConfiguration } from "@app/lib/api/assistant/legacy_agent";
import { getRedisClient } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { AgentMessageContent } from "@app/lib/models/assistant/agent_message_content";
import { cloneBaseConfig, DustProdActionRegistry } from "@app/lib/registry";
import logger from "@app/logger/logger";

import { getCitationsCount } from "./actions/utils";

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
  | AgentActionSpecificEvent
  | AgentActionSuccessEvent
  | GenerationTokensEvent
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
  for (let i = 0; i < maxStepsPerRun + 1; i++) {
    const localLogger = logger.child({
      workspaceId: conversation.owner.sId,
      conversationId: conversation.sId,
      multiActionLoopIteration: i,
    });

    localLogger.info("Starting multi-action loop iteration");

    const isLastGenerationIteration = i === maxStepsPerRun;

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

    const runIds = [];

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
          runIds.push(event.runId);
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
          for (let j = 0; j < event.actions.length; j++) {
            citationsRefsOffset += getCitationsCount({
              agentConfiguration: configuration,
              stepActions: event.actions.map((a) => a.action),
              stepActionIndex: j,
            });
          }

          break;

        case "agent_message_content":
          // We store the raw content emitted by the agent.
          await AgentMessageContent.create({
            agentMessageId: agentMessage.agentMessageId,
            step: i,
            content: event.content,
          });
          agentMessage.rawContents.push({
            step: i,
            content: event.content,
          });
          processedContent += event.processedContent;
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
  | AgentContentEvent
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
    conversation,
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
    const specRes = await getRunnerForActionConfiguration(a).buildSpecification(
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
  const redis = await getRedisClient({ origin: "assistant_generation" });
  let isGeneration = true;

  const contentParser = new AgentMessageContentParser(
    agentConfiguration,
    agentMessage.sId,
    getDelimitersConfiguration({ agentConfiguration })
  );

  let rawContent = "";

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
      yield* contentParser.flushTokens();
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
            message: `Error running assistant: ${e.error}`,
          },
        } satisfies AgentErrorEvent;
        return;
      }

      if (event.content.block_name === "OUTPUT" && e.value) {
        // Flush early as we know the generation is terminated here.
        yield* contentParser.flushTokens();

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

  yield* contentParser.flushTokens();

  if (!output.actions.length) {
    if (typeof output.generation === "string") {
      yield {
        type: "agent_message_content",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        content: rawContent,
        processedContent: contentParser.getContent() ?? "",
      } satisfies AgentContentEvent;
      yield {
        type: "generation_success",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        text: contentParser.getContent() ?? "",
        runId: await dustRunId,
        chainOfThought: contentParser.getChainOfThought() ?? "",
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

  yield* contentParser.flushTokens();

  const chainOfThought = contentParser.getChainOfThought();

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
    const eventStream = getRunnerForActionConfiguration(
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

    const eventStream = getRunnerForActionConfiguration(
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
    const eventStream = getRunnerForActionConfiguration(
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
        case "tables_query_started":
        case "tables_query_model_output":
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
        case "tables_query_output":
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
    const eventStream = getRunnerForActionConfiguration(
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
    const eventStream = getRunnerForActionConfiguration(
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
    const eventStream = getRunnerForActionConfiguration(
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
