import type {
  AgentActionConfigurationType,
  AgentActionEvent,
  AgentActionSpecification,
  AgentActionSuccessEvent,
  AgentConfigurationType,
  AgentErrorEvent,
  AgentGenerationCancelledEvent,
  AgentGenerationConfigurationType,
  AgentGenerationSuccessEvent,
  AgentMessageSuccessEvent,
  AgentMessageType,
  ConversationType,
  GenerationTokensEvent,
  LightAgentConfigurationType,
  Result,
  UserMessageType,
} from "@dust-tt/types";
import {
  assertNever,
  cloneBaseConfig,
  DustProdActionRegistry,
  Err,
  GPT_4_TURBO_MODEL_CONFIG,
  isAgentConfiguration,
  isDustAppRunConfiguration,
  isProcessConfiguration,
  isRetrievalConfiguration,
  isTablesQueryConfiguration,
  Ok,
  removeNulls,
} from "@dust-tt/types";

import { runActionStreamed } from "@app/lib/actions/server";
import {
  generateDustAppRunSpecification,
  runDustApp,
} from "@app/lib/api/assistant/actions/dust_app_run";
import {
  generateProcessSpecification,
  runProcess,
} from "@app/lib/api/assistant/actions/process";
import {
  generateRetrievalSpecification,
  runRetrieval,
} from "@app/lib/api/assistant/actions/retrieval";
import {
  generateTablesQuerySpecification,
  runTablesQuery,
} from "@app/lib/api/assistant/actions/tables_query";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import {
  constructPrompt,
  renderConversationForModel,
  runGeneration,
} from "@app/lib/api/assistant/generation";
import { runLegacyAgent } from "@app/lib/api/assistant/legacy_agent";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";

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
  | AgentActionEvent
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
    : runMultiActionsAgent(
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

// This function returns true if the agent is a "legacy" agent with a forced schedule,
// i.e it has a maxToolsUsePerRun <= 2, every possible iteration has a forced action,
// and every tool is forced at a certain iteration.
export function isLegacyAgent(configuration: AgentConfigurationType): boolean {
  // TODO(@fontanierh): change once generation is part of actions.
  const actions = removeNulls([
    ...configuration.actions,
    configuration.generation,
  ]);

  return (
    configuration.maxToolsUsePerRun <= 2 &&
    Array.from(Array(configuration.maxToolsUsePerRun).keys()).every((i) =>
      actions.some((a) => a.forceUseAtIteration === i)
    ) &&
    actions.every((a) => a.forceUseAtIteration !== undefined)
  );
}

export async function* runMultiActionsAgent(
  auth: Authenticator,
  configuration: AgentConfigurationType,
  conversation: ConversationType,
  userMessage: UserMessageType,
  agentMessage: AgentMessageType
): AsyncGenerator<
  | AgentErrorEvent
  | AgentActionEvent
  | AgentActionSuccessEvent
  | GenerationTokensEvent
  | AgentGenerationSuccessEvent
  | AgentGenerationCancelledEvent
  | AgentMessageSuccessEvent,
  void
> {
  const now = Date.now();

  for (let i = 0; i < configuration.maxToolsUsePerRun; i++) {
    const localLogger = logger.child({
      workspaceId: conversation.owner.sId,
      conversationId: conversation.sId,
      multiActionLoopIteration: i,
    });

    localLogger.info("Starting multi-action loop iteration");

    const forcedAction = configuration.actions.find(
      (a) => a.forceUseAtIteration === i
    );
    const actions = forcedAction ? [forcedAction] : configuration.actions;

    const actionToRun = await getNextAction(auth, {
      agentConfiguration: configuration,
      conversation,
      userMessage,
      availableActions: actions,
      isGenerationAllowed: !forcedAction,
      forcedActionName: forcedAction?.name ?? undefined,
    });

    if (actionToRun.isErr()) {
      localLogger.error(
        {
          elapsedTime: Date.now() - now,
          error: actionToRun.error,
        },
        "Error getting next action"
      );
      yield {
        type: "agent_error",
        created: now,
        configurationId: configuration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "parameters_generation_error",
          message: `Error getting next action: ${actionToRun.error.message}`,
        },
      };
      return;
    }

    localLogger.info(
      {
        elapsed: Date.now() - now,
      },
      "[ASSISTANT_TRACE] Action inputs generation"
    );

    const { action, inputs, specification } = actionToRun.value;

    if (isAgentConfiguration(action)) {
      const eventStream = runAction(auth, {
        configuration: configuration,
        actionConfiguration: action,
        conversation,
        userMessage,
        agentMessage,
        inputs,
        specification,
      });
      for await (const event of eventStream) {
        yield event;
      }
    } else {
      // TODO(@fontanierh): remove this once generation is part of actions.
      // This is just to assert that we cover all action types.
      ((g: AgentGenerationConfigurationType) => {
        void g;
      })(action);
      // If the next action is the generation, we simply break out of the loop,
      // as we always run the generation after the actions loop.
      break;
    }
  }

  const eventStream = runGeneration(
    auth,
    configuration,
    conversation,
    userMessage,
    agentMessage
  );

  for await (const event of eventStream) {
    switch (event.type) {
      case "generation_tokens":
        yield event;
        break;

      case "generation_error":
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

      case "generation_cancel":
        yield {
          type: "agent_generation_cancelled",
          created: event.created,
          configurationId: configuration.sId,
          messageId: agentMessage.sId,
        };
        return;

      case "generation_success":
        yield {
          type: "agent_generation_success",
          created: event.created,
          configurationId: configuration.sId,
          messageId: agentMessage.sId,
          text: event.text,
        };

        agentMessage.content = event.text;
        break;

      default:
        ((event: never) => {
          logger.error("Unknown `runAgent` event type", event);
        })(event);
        return;
    }
  }

  agentMessage.status = "succeeded";
  yield {
    type: "agent_message_success",
    created: Date.now(),
    configurationId: configuration.sId,
    messageId: agentMessage.sId,
    message: agentMessage,
  };
}

// This method is used by the multi-actions execution loop to pick the next action
// to execute and generate its inputs.
export async function getNextAction(
  auth: Authenticator,
  {
    agentConfiguration,
    conversation,
    userMessage,
    availableActions,
    isGenerationAllowed = true,
    forcedActionName,
  }: {
    agentConfiguration: AgentConfigurationType;
    conversation: ConversationType;
    userMessage: UserMessageType;
    availableActions: AgentActionConfigurationType[];
    // TODO(@fontanierh): remove this once generation is part of actions.
    isGenerationAllowed: boolean;
    forcedActionName?: string;
  }
): Promise<
  Result<
    {
      action: AgentActionConfigurationType | AgentGenerationConfigurationType;
      inputs: Record<string, string | boolean | number>;
      specification: AgentActionSpecification | null;
    },
    Error
  >
> {
  // TODO(@fontanierh): Make a new one for multi actions.
  let prompt = await constructPrompt(
    auth,
    userMessage,
    agentConfiguration,
    "You are a conversational assistant with access to function calling."
  );

  // TODO(@fontanierh): revisit
  const model = GPT_4_TURBO_MODEL_CONFIG;

  const MIN_GENERATION_TOKENS = 2048;

  // Turn the conversation into a digest that can be presented to the model.
  // TODO(@fontanierh): Make a new one for multi actions.
  const modelConversationRes = await renderConversationForModel({
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
    } else if (isDustAppRunConfiguration(a)) {
      const r = await generateDustAppRunSpecification(auth, {
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
      assertNever(a);
    }
  }

  // TODO(@fontanierh): remove this once generation is part of actions.
  if (agentConfiguration.generation && isGenerationAllowed) {
    specifications.push({
      name: "reply_to_user",
      description:
        "Reply to the user with a message. You don't need to generate any arguments for this function.",
      inputs: [],
    });
    prompt = `${prompt}\nIf you don't know which function to use, use \`reply_to_user\`.`;
  }

  const config = cloneBaseConfig(
    DustProdActionRegistry["assistant-v2-use-tools"].config
  );
  config.MODEL.function_call = forcedActionName ?? "auto";
  config.MODEL.provider_id = model.providerId;
  config.MODEL.model_id = model.modelId;

  const res = await runActionStreamed(auth, "assistant-v2-use-tools", config, [
    {
      conversation: modelConversationRes.value.modelConversation,
      specifications,
      prompt,
    },
  ]);

  if (res.isErr()) {
    return new Err(
      new Error(
        `Error running use-tools action: [${res.error.type}] ${res.error.message}`
      )
    );
  }

  const { eventStream } = res.value;

  const output: {
    name?: string;
    arguments?: Record<string, string | boolean | number>;
  } = {};

  for await (const event of eventStream) {
    if (event.type === "error") {
      return new Err(
        new Error(`Error generating action inputs: ${event.content.message}`)
      );
    }

    if (event.type === "block_execution") {
      const e = event.content.execution[0][0];
      if (e.error) {
        return new Err(new Error(`Error generating action inputs: ${e.error}`));
      }

      if (event.content.block_name === "OUTPUT" && e.value) {
        const v = e.value as any;
        if (Array.isArray(v)) {
          const first = v[0];
          if ("name" in first) {
            output.name = first.name;
          }
          if ("arguments" in first) {
            output.arguments = first.arguments;
          }
        }
      }
    }
  }

  if (!output.name) {
    return new Err(new Error("No action found"));
  }
  output.arguments = output.arguments ?? {};

  const action =
    output.name === "reply_to_user"
      ? agentConfiguration.generation
      : agentConfiguration.actions.find((a) => a.name === output.name);

  const spec = specifications.find((s) => s.name === output.name) ?? null;

  if (!action) {
    return new Err(new Error(`Action ${output.name} not found`));
  }

  return new Ok({
    action,
    inputs: output.arguments,
    specification: spec,
  });
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
  }: {
    configuration: AgentConfigurationType;
    actionConfiguration: AgentActionConfigurationType;
    conversation: ConversationType;
    userMessage: UserMessageType;
    agentMessage: AgentMessageType;
    inputs: Record<string, string | boolean | number>;
    specification: AgentActionSpecification | null;
  }
): AsyncGenerator<
  | AgentActionEvent
  | AgentErrorEvent
  | AgentActionEvent
  | AgentActionSuccessEvent,
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
          agentMessage.action = event.action;
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
    const eventStream = runDustApp(auth, {
      configuration,
      actionConfiguration,
      conversation,
      agentMessage,
      spec: specification,
      rawInputs: inputs,
    });

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
          agentMessage.action = event.action;
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
          agentMessage.action = event.action;
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
          agentMessage.action = event.action;
          break;

        default:
          assertNever(event);
      }
    }
  } else {
    assertNever(actionConfiguration);
  }
}
