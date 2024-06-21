import type {
  AgentActionConfigurationType,
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
  GenerationTokensEvent,
  Result,
  UserMessageType,
} from "@dust-tt/types";
import {
  assertNever,
  cloneBaseConfig,
  DustProdActionRegistry,
  Err,
  getLargeWhitelistedModel,
  getSmallWhitelistedModel,
  isBrowseConfiguration,
  isDustAppRunConfiguration,
  isProcessConfiguration,
  isRetrievalConfiguration,
  isTablesQueryConfiguration,
  isWebsearchConfiguration,
  Ok,
} from "@dust-tt/types";

import { runActionStreamed } from "@app/lib/actions/server";
import { getRunnerforActionConfiguration } from "@app/lib/api/assistant/actions/runners";
import {
  constructPrompt,
  renderConversationForModelMultiActions,
  runGeneration,
} from "@app/lib/api/assistant/generation";
import type { Authenticator } from "@app/lib/auth";
import { deprecatedGetFirstActionConfiguration } from "@app/lib/deprecated_action_configurations";
import logger from "@app/logger/logger";

/**
 * Action Inputs generation.
 */

// This method is used by actions to generate its inputs if needed.
async function generateActionInputs(
  auth: Authenticator,
  configuration: AgentConfigurationType,
  specification: AgentActionSpecification,
  conversation: ConversationType,
  userMessage: UserMessageType
): Promise<Result<Record<string, string | boolean | number>, Error>> {
  const owner = auth.workspace();
  if (!owner) {
    return new Err(new Error("Unexpected `auth` without `workspace`."));
  }

  // We inject the prompt of the model so that its input generation behavior can be modified by its
  // instructions. It also injects context about the local time. If there is no generation phase we
  // default to a generic prompt.
  const prompt = await constructPrompt(
    auth,
    userMessage,
    configuration,
    "You are a conversational assistant with access to function calling."
  );

  const MIN_GENERATION_TOKENS = 2048;

  const model = !auth.isUpgraded()
    ? getSmallWhitelistedModel(owner)
    : getLargeWhitelistedModel(owner);
  if (!model) {
    return new Err(new Error("No whitelisted model found for the workspace."));
  }

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

  const config = cloneBaseConfig(
    DustProdActionRegistry["assistant-v2-inputs-generator"].config
  );
  config.MODEL.function_call = specification.name;
  config.MODEL.provider_id = model.providerId;
  config.MODEL.model_id = model.modelId;

  const res = await runActionStreamed(
    auth,
    "assistant-v2-inputs-generator",
    config,
    [
      {
        conversation: modelConversationRes.value.modelConversation,
        specification,
        prompt,
      },
    ],
    {
      workspaceId: conversation.owner.sId,
      conversationId: conversation.sId,
      userMessageId: userMessage.sId,
    }
  );

  if (res.isErr()) {
    return new Err(
      new Error(
        `Error generating action inputs: [${res.error.type}] ${res.error.message}`
      )
    );
  }

  const { eventStream } = res.value;

  const output: Record<string, string | boolean | number> = {};

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
        for (const k in v) {
          if (
            typeof v[k] === "string" ||
            typeof v[k] === "boolean" ||
            typeof v[k] === "number"
          ) {
            output[k] = v[k];
          }
        }
      }
    }
  }

  return new Ok(output);
}

/**
 * Agent execution.
 */

// This interface is used to execute an agent. It is not in charge of creating the AgentMessage,
// nor updating it (responsability of the caller based on the emitted events).
export async function* runLegacyAgent(
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
  | AgentChainOfThoughtEvent,
  void
> {
  const action = deprecatedGetFirstActionConfiguration(configuration);

  if (action !== null) {
    for await (const event of runAction(auth, {
      configuration,
      conversation,
      userMessage,
      agentMessage,
      action,
      step: 0,
    })) {
      yield event;
    }
  }

  // Then run the generation if a configuration is present.
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
          runId: event.runId,
          text: event.text,
        };
        agentMessage.content = event.text;
        agentMessage.status = "succeeded";
        break;

      case "agent_error":
        yield event;
        break;

      case "agent_chain_of_thought":
        agentMessage.chainOfThoughts.push(event.chainOfThought);
        break;

      default:
        assertNever(event);
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

async function* runAction(
  auth: Authenticator,
  {
    configuration,
    conversation,
    userMessage,
    agentMessage,
    action,
    step,
  }: {
    configuration: AgentConfigurationType;
    conversation: ConversationType;
    userMessage: UserMessageType;
    agentMessage: AgentMessageType;
    action: AgentActionConfigurationType;
    step: number;
  }
): AsyncGenerator<
  | AgentActionSpecificEvent
  | AgentErrorEvent
  | AgentActionSpecificEvent
  | AgentActionSuccessEvent,
  void
> {
  const now = Date.now();

  let specRes: Result<AgentActionSpecification, Error> | null = null;

  specRes = await getRunnerforActionConfiguration(action).buildSpecification(
    auth,
    {
      name: action.name,
      description: action.description,
    }
  );

  if (specRes.isErr()) {
    logger.error(
      {
        workspaceId: conversation.owner.sId,
        conversationId: conversation.sId,
        elapsed: Date.now() - now,
        error: specRes.error,
      },
      "Error generating action specification"
    );
    yield {
      type: "agent_error",
      created: now,
      configurationId: configuration.sId,
      messageId: agentMessage.sId,
      error: {
        code: "parameters_generation_error",
        message: `Error generating action specification: ${specRes.error.message}`,
      },
    };
    return;
  }

  let rawInputs: Record<string, string | boolean | number> = {};

  if (specRes.value.inputs.length > 0) {
    const rawInputsRes = await generateActionInputs(
      auth,
      configuration,
      specRes.value,

      conversation,
      userMessage
    );

    if (rawInputsRes.isErr()) {
      logger.error(
        {
          workspaceId: conversation.owner.sId,
          conversationId: conversation.sId,
          elapsed: Date.now() - now,
          error: rawInputsRes.error,
        },
        "Error generating action inputs"
      );
      yield {
        type: "agent_error",
        created: now,
        configurationId: configuration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "parameters_generation_error",
          message: `Error generating action parameters: ${rawInputsRes.error.message}`,
        },
      };
      return;
    }
    logger.info(
      {
        workspaceId: conversation.owner.sId,
        conversationId: conversation.sId,
        elapsed: Date.now() - now,
      },
      "[ASSISTANT_TRACE] Action inputs generation"
    );

    rawInputs = rawInputsRes.value;
  }

  if (isRetrievalConfiguration(action)) {
    const eventStream = getRunnerforActionConfiguration(action).run(
      auth,
      {
        agentConfiguration: configuration,
        conversation,
        agentMessage,
        rawInputs,
        functionCallId: null,
        step,
      },
      {}
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
  } else if (isDustAppRunConfiguration(action)) {
    const eventStream = getRunnerforActionConfiguration(action).run(
      auth,
      {
        agentConfiguration: configuration,
        conversation,
        agentMessage,
        rawInputs,
        functionCallId: null,
        step,
      },
      {
        spec: specRes.value,
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
  } else if (isTablesQueryConfiguration(action)) {
    const eventStream = getRunnerforActionConfiguration(action).run(auth, {
      agentConfiguration: configuration,
      conversation,
      agentMessage,
      rawInputs,
      functionCallId: null,
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
  } else if (isProcessConfiguration(action)) {
    const eventStream = getRunnerforActionConfiguration(action).run(auth, {
      agentConfiguration: configuration,
      conversation,
      agentMessage,
      userMessage,
      rawInputs,
      functionCallId: null,
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
  } else if (isWebsearchConfiguration(action)) {
    // TODO(pr) refactor the isXXX cases to avoid the duplication for process and websearch?
    const eventStream = getRunnerforActionConfiguration(action).run(auth, {
      agentConfiguration: configuration,
      conversation,
      agentMessage,
      rawInputs,
      functionCallId: null,
      step,
    });

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
  } else if (isBrowseConfiguration(action)) {
    const eventStream = getRunnerforActionConfiguration(action).run(auth, {
      agentConfiguration: configuration,
      conversation,
      agentMessage,
      rawInputs,
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
  } else {
    assertNever(action);
  }
}
