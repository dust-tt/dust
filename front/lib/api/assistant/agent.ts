import {
  AgentActionEvent,
  AgentActionSuccessEvent,
  AgentErrorEvent,
  AgentGenerationCancelledEvent,
  AgentGenerationSuccessEvent,
  AgentMessageSuccessEvent,
  GenerationTokensEvent,
  GPT_3_5_TURBO_MODEL_CONFIG,
  GPT_4_32K_MODEL_CONFIG,
  GPT_4_MODEL_CONFIG,
  GPT_4_TURBO_MODEL_CONFIG,
} from "@dust-tt/types";
import {
  AgentActionSpecification,
  AgentConfigurationType,
} from "@dust-tt/types";
import {
  AgentMessageType,
  ConversationType,
  UserMessageType,
} from "@dust-tt/types";
import { isDustAppRunConfiguration } from "@dust-tt/types";
import { isRetrievalConfiguration } from "@dust-tt/types";
import { cloneBaseConfig, DustProdActionRegistry } from "@dust-tt/types";
import { Err, Ok, Result } from "@dust-tt/types";

import { runActionStreamed } from "@app/lib/actions/server";
import { runRetrieval } from "@app/lib/api/assistant/actions/retrieval";
import {
  constructPrompt,
  renderConversationForModel,
  runGeneration,
} from "@app/lib/api/assistant/generation";
import { Authenticator } from "@app/lib/auth";
import { FREE_TEST_PLAN_CODE } from "@app/lib/plans/plan_codes";
import logger from "@app/logger/logger";

import { runDustApp } from "./actions/dust_app_run";

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
  const prompt = await constructPrompt(
    auth,
    userMessage,
    configuration,
    "You are a conversational assistant with access to function calling."
  );

  const MIN_GENERATION_TOKENS = 2048;

  const plan = auth.plan();
  const isFree = !plan || plan.code === FREE_TEST_PLAN_CODE;

  let model: { providerId: string; modelId: string } = isFree
    ? {
        providerId: GPT_3_5_TURBO_MODEL_CONFIG.providerId,
        modelId: GPT_3_5_TURBO_MODEL_CONFIG.modelId,
      }
    : {
        providerId: GPT_4_32K_MODEL_CONFIG.providerId,
        modelId: GPT_4_32K_MODEL_CONFIG.modelId,
      };

  const contextSize = isFree
    ? GPT_3_5_TURBO_MODEL_CONFIG.contextSize
    : GPT_4_TURBO_MODEL_CONFIG.contextSize;

  // Turn the conversation into a digest that can be presented to the model.
  const modelConversationRes = await renderConversationForModel({
    conversation,
    model,
    prompt,
    allowedTokenCount: contextSize - MIN_GENERATION_TOKENS,
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
    ]
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
