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
  GenerationTokensEvent,
  renderConversationForModel,
  runGeneration,
} from "@app/lib/api/assistant/generation";
import { Authenticator } from "@app/lib/auth";
import { Err, Ok, Result } from "@app/lib/result";
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

/**
 * Action Inputs generation.
 */

// This method is used by actions to generate its inputs if needed.
export async function generateActionInputs(
  auth: Authenticator,
  specification: AgentActionSpecification,
  conversation: ConversationType
): Promise<Result<Record<string, string | boolean | number>, Error>> {
  const model = {
    providerId: "openai",
    modelId: "gpt-3.5-turbo-16k",
  };
  const allowedTokenCount = 12288; // for 16k model.

  // Turn the conversation into a digest that can be presented to the model.
  const modelConversationRes = await renderConversationForModel({
    conversation,
    model,
    allowedTokenCount,
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

  const res = await runAction(auth, "assistant-v2-inputs-generator", config, [
    {
      conversation: modelConversationRes.value,
      specification,
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

// Event sent durint the execution of an action. These are action specific.
export type AgentActionEvent = RetrievalParamsEvent;

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
  | AgentMessageSuccessEvent
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
        if (event.type === "retrieval_params") {
          yield event;
        }
        if (event.type === "retrieval_error") {
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
        }
        if (event.type === "retrieval_success") {
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
        }
      }
    } else {
      throw new Error(
        "runAgent implementation missing for action configuration"
      );
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
      if (event.type === "generation_tokens") {
        yield event;
      }
      if (event.type === "generation_error") {
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
      }
      if (event.type === "generation_success") {
        yield {
          type: "agent_generation_success",
          created: event.created,
          configurationId: configuration.sId,
          messageId: agentMessage.sId,
          text: event.text,
        };
      }
    }
  }
}
