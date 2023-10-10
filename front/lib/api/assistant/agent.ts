import {
  cloneBaseConfig,
  DustProdActionRegistry,
} from "@app/lib/actions/registry";
import { runAction } from "@app/lib/actions/server";
import {
  RetrievalParamsEvent,
  runRetrieval,
} from "@app/lib/api/assistant/actions/retrieval";
import {
  constructPrompt,
  GenerationTokensEvent,
  renderConversationForModel,
  runGeneration,
} from "@app/lib/api/assistant/generation";
import {
  GPT_3_5_TURBO_16K_MODEL_CONFIG,
  GPT_4_32K_MODEL_CONFIG,
  GPT_4_MODEL_CONFIG,
} from "@app/lib/assistant";
import { Authenticator } from "@app/lib/auth";
import { Err, Ok, Result } from "@app/lib/result";
import logger from "@app/logger/logger";
import { isDustAppRunConfiguration } from "@app/types/assistant/actions/dust_app_run";
import { isRetrievalConfiguration } from "@app/types/assistant/actions/retrieval";
import {
  AgentActionSpecification,
  AgentConfigurationType,
} from "@app/types/assistant/agent";
import {
  AgentActionType,
  AgentMessageType,
  ConversationType,
  UserMessageType,
} from "@app/types/assistant/conversation";

import {
  DustAppRunBlockEvent,
  DustAppRunParamsEvent,
  runDustApp,
} from "./actions/dust_app_run";

/**
 * Action Inputs generation.
 */

// This method is used by actions to generate its inputs if needed.
export async function generateActionInputs(
  auth: Authenticator,
  configuration: AgentConfigurationType,
  specification: AgentActionSpecification,
  conversation: ConversationType,
  userMessage: UserMessageType
): Promise<Result<Record<string, string | boolean | number>, Error>> {
  // We inject the prompt of the model so that its input generation behavior can be modified by its
  // instructions. It also injects context about the local time. If there is no generation phase we
  // default to a generic prompt.
  const prompt = constructPrompt(
    userMessage,
    configuration,
    "You are a conversational assistant with access to function calling."
  );

  const MIN_GENERATION_TOKENS = 2048;

  const useLargeModels = auth.workspace()?.plan.limits.largeModels
    ? true
    : false;

  let model: { providerId: string; modelId: string } = useLargeModels
    ? {
        providerId: GPT_4_32K_MODEL_CONFIG.providerId,
        modelId: GPT_4_32K_MODEL_CONFIG.modelId,
      }
    : {
        providerId: GPT_3_5_TURBO_16K_MODEL_CONFIG.providerId,
        modelId: GPT_3_5_TURBO_16K_MODEL_CONFIG.modelId,
      };

  // Turn the conversation into a digest that can be presented to the model.
  const modelConversationRes = await renderConversationForModel({
    conversation,
    model,
    prompt,
    allowedTokenCount:
      GPT_4_32K_MODEL_CONFIG.contextSize - MIN_GENERATION_TOKENS,
  });

  if (modelConversationRes.isErr()) {
    return modelConversationRes;
  }

  // If we use gpt-4-32k but tokens used is less than GPT_4_CONTEXT_SIZE-MIN_GENERATION_TOKENS then
  // switch the model back to GPT_4 standard (8k context, cheaper).
  if (
    model.modelId === GPT_4_32K_MODEL_CONFIG.modelId &&
    modelConversationRes.value.tokensUsed <
      GPT_4_MODEL_CONFIG.contextSize - MIN_GENERATION_TOKENS
  ) {
    model = {
      providerId: GPT_4_MODEL_CONFIG.providerId,
      modelId: GPT_4_MODEL_CONFIG.modelId,
    };
  }

  const config = cloneBaseConfig(
    DustProdActionRegistry["assistant-v2-inputs-generator"].config
  );
  config.MODEL.function_call = specification.name;
  config.MODEL.provider_id = model.providerId;
  config.MODEL.model_id = model.modelId;

  const res = await runAction(auth, "assistant-v2-inputs-generator", config, [
    {
      conversation: modelConversationRes.value.modelConversation,
      specification,
      prompt,
    },
  ]);

  if (res.isErr()) {
    return new Err(new Error(`Error generating action inputs: ${res.error}`));
  }

  const run = res.value;

  const output: Record<string, string | boolean | number> = {};
  for (const t of run.traces) {
    if (t[1][0][0].error) {
      return new Err(
        new Error(`Error generating action inputs: ${t[1][0][0].error}`)
      );
    }
    if (t[0][1] === "OUTPUT") {
      const v = t[1][0][0].value as any;
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

  return new Ok(output);
}

/**
 * Agent execution.
 */

// Generic event sent when an error occured (whether it's during the action or the message generation).
export type AgentErrorEvent = {
  type: "agent_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
  };
};

// Event sent during the execution of an action. These are action specific.
export type AgentActionEvent =
  | RetrievalParamsEvent
  | DustAppRunParamsEvent
  | DustAppRunBlockEvent;

// Event sent once the action is completed, we're moving to generating a message if applicable.
export type AgentActionSuccessEvent = {
  type: "agent_action_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: AgentActionType;
};

// Event sent once the generation is completed.
export type AgentGenerationSuccessEvent = {
  type: "agent_generation_success";
  created: number;
  configurationId: string;
  messageId: string;
  text: string;
};

// Event sent to stop the generation.
export type AgentGenerationCancelledEvent = {
  type: "agent_generation_cancelled";
  created: number;
  configurationId: string;
  messageId: string;
};

// Event sent once the message is completed and successful.
export type AgentMessageSuccessEvent = {
  type: "agent_message_success";
  created: number;
  configurationId: string;
  messageId: string;
  message: AgentMessageType;
};

// This interface is used to execute an agent. It is not in charge of creating the AgentMessage,
// nor updating it (responsability of the caller based on the emitted events).
export async function* runAgent(
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
  // First run the action if a configuration is present.
  if (configuration.action !== null) {
    if (isRetrievalConfiguration(configuration.action)) {
      const eventStream = runRetrieval(
        auth,
        configuration,
        conversation,
        userMessage,
        agentMessage
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
            agentMessage.action = event.action;
            break;

          default:
            ((event: never) => {
              logger.error("Unknown `runAgent` event type", event);
            })(event);
            return;
        }
      }
    } else if (isDustAppRunConfiguration(configuration.action)) {
      const eventStream = runDustApp(
        auth,
        configuration,
        conversation,
        userMessage,
        agentMessage
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
            agentMessage.action = event.action;
            break;

          default:
            ((event: never) => {
              logger.error("Unknown `runAgent` event type", event);
            })(event);
            return;
        }
      }
    } else {
      ((a: never) => {
        throw new Error(`Unexpected action type: ${a}`);
      })(configuration.action);
    }
  }

  // Then run the generation if a configuration is present.
  if (configuration.generation !== null) {
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
