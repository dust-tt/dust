import {
  cloneBaseConfig,
  DustProdActionRegistry,
} from "@app/lib/actions/registry";
import { runActionStreamed } from "@app/lib/actions/server";
import { renderRetrievalActionForModel } from "@app/lib/api/assistant/actions/retrieval";
import { Authenticator } from "@app/lib/auth";
import { CoreAPI } from "@app/lib/core_api";
import { Err, Ok, Result } from "@app/lib/result";
import logger from "@app/logger/logger";
import { isRetrievalActionType } from "@app/types/assistant/actions/retrieval";
import { AgentConfigurationType } from "@app/types/assistant/agent";
import {
  AgentMessageType,
  ConversationType,
  isAgentMessageType,
  isUserMessageType,
  UserMessageType,
} from "@app/types/assistant/conversation";

/**
 * Model rendering of conversations.
 */

export type ModelMessageType = {
  role: "action" | "agent" | "user";
  name: string;
  content: string;
};

export type ModelConversationType = {
  messages: ModelMessageType[];
};

// This function transforms a conversation in a simplified format that we feed the model as context.
// It takes care of truncating the conversation all the way to `allowedTokenCount` tokens.
export async function renderConversationForModel({
  conversation,
  model,
  allowedTokenCount,
}: {
  conversation: ConversationType;
  model: { providerId: string; modelId: string };
  allowedTokenCount: number;
}): Promise<Result<ModelConversationType, Error>> {
  const messages = [];

  let retrievalFound = false;

  // Render all messages and all actions but only keep the latest retrieval action.
  for (let i = conversation.content.length - 1; i >= 0; i--) {
    const versions = conversation.content[i];
    const m = versions[versions.length - 1];

    if (isAgentMessageType(m)) {
      if (m.action) {
        if (isRetrievalActionType(m.action) && !retrievalFound) {
          messages.unshift(renderRetrievalActionForModel(m.action));
          retrievalFound = true;
        } else {
          return new Err(
            new Error(
              "Unsupported action type during conversation model rendering"
            )
          );
        }
      }
      if (m.content) {
        messages.unshift({
          role: "agent" as const,
          name: m.configuration.name,
          content: m.content,
        });
      }
    }
    if (isUserMessageType(m)) {
      messages.unshift({
        role: "user" as const,
        name: m.context.username,
        content: m.content,
      });
    }
  }

  async function tokenCountForMessage(
    message: ModelMessageType,
    model: { providerId: string; modelId: string }
  ): Promise<Result<number, Error>> {
    const res = await CoreAPI.tokenize({
      text: message.content,
      providerId: model.providerId,
      modelId: model.modelId,
    });

    if (res.isErr()) {
      return new Err(new Error(`Error tokenizing model message: ${res.error}`));
    }

    return new Ok(res.value.tokens.length);
  }

  const now = Date.now();

  // This is a bit aggressive but fuck it.
  const tokenCountRes = await Promise.all(
    messages.map((m) => {
      return tokenCountForMessage(m, model);
    })
  );

  logger.info(
    {
      messageCount: messages.length,
      elapsed: Date.now() - now,
    },
    "[ASSISTANT_STATS] message token counts for model conversation rendering"
  );

  // Go backward and accumulate as much as we can within allowedTokenCount.
  const selected = [];
  let tokensUsed = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const r = tokenCountRes[i];
    if (r.isErr()) {
      return new Err(r.error);
    }
    const c = r.value;
    if (tokensUsed + c <= allowedTokenCount) {
      tokensUsed += c;
      selected.unshift(messages[i]);
    }
  }

  return new Ok({
    messages: selected,
  });
}

function modelToContextSize(model: {
  providerId: string;
  modelId: string;
}): number | null {
  switch (model.providerId) {
    case "openai": {
      if (model.modelId.startsWith("gpt-3.5-turbo")) {
        return 4096;
      }
      if (model.modelId.startsWith("gpt-4-32k")) {
        return 32768;
      }
      if (model.modelId.startsWith("gpt-4")) {
        return 8192;
      }
      break;
    }
    case "anthropic":
      return 100000;
  }
  return null;
}

/**
 * Generation execution.
 */

// Event sent when tokens are streamed as the the agent is generating a message.
export type GenerationTokensEvent = {
  type: "generation_tokens";
  created: number;
  configurationId: string;
  messageId: string;
  text: string;
};

export type GenerationErrorEvent = {
  type: "generation_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
  };
};

export type GenerationSuccessEvent = {
  type: "generation_success";
  created: number;
  configurationId: string;
  messageId: string;
  text: string;
};

// This function is in charge of running the generation of a message from the agent. It does not
// create any state, only stream tokens and/or error and final success events.
export async function* runGeneration(
  auth: Authenticator,
  configuration: AgentConfigurationType,
  conversation: ConversationType,
  userMessage: UserMessageType,
  agentMessage: AgentMessageType
): AsyncGenerator<
  GenerationErrorEvent | GenerationTokensEvent | GenerationSuccessEvent
> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected unauthenticated call to `runRetrieval`");
  }

  const c = configuration.generation;

  if (!c) {
    return yield {
      type: "generation_error",
      created: Date.now(),
      configurationId: configuration.sId,
      messageId: agentMessage.sId,
      error: {
        code: "internal_server_error",
        message:
          "Unexpected missing generation configuration received in `runGeneration`",
      },
    };
  }

  const model = c.model;

  const contextSize = modelToContextSize(model);
  if (contextSize === null) {
    return yield {
      type: "generation_error",
      created: Date.now(),
      configurationId: configuration.sId,
      messageId: agentMessage.sId,
      error: {
        code: "internal_server_error",
        message: `Unknown context size for model: ${model.providerId} ${model.modelId}`,
      },
    };
  }

  const MIN_GENERATION_TOKENS = 2048;

  if (contextSize < MIN_GENERATION_TOKENS) {
    throw new Error(
      `Model contextSize unexpectedly small for model: ${model.providerId} ${model.modelId}`
    );
  }

  // Turn the conversation into a digest that can be presented to the model.
  const modelConversationRes = await renderConversationForModel({
    conversation,
    model,
    allowedTokenCount: contextSize - MIN_GENERATION_TOKENS,
  });

  if (modelConversationRes.isErr()) {
    return modelConversationRes;
  }

  const config = cloneBaseConfig(
    DustProdActionRegistry["assistant-v2-generator"].config
  );
  config.MODEL.provider_id = model.providerId;
  config.MODEL.model_id = model.modelId;

  const res = await runActionStreamed(auth, "assistant-v2-generator", config, [
    {
      conversation: modelConversationRes.value,
      prompt: c.prompt,
    },
  ]);

  if (res.isErr()) {
    return yield {
      type: "generation_error",
      created: Date.now(),
      configurationId: configuration.sId,
      messageId: agentMessage.sId,
      error: {
        code: "agent_generation_error",
        message: `Error generating agent message: ${res.error}`,
      },
    };
  }

  const { eventStream } = res.value;

  for await (const event of eventStream) {
    if (event.type === "tokens") {
      yield {
        type: "generation_tokens",
        created: Date.now(),
        configurationId: configuration.sId,
        messageId: agentMessage.sId,
        text: event.content.tokens.text,
      };
    }

    if (event.type === "error") {
      return yield {
        type: "generation_error",
        created: Date.now(),
        configurationId: configuration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "agent_generation_error",
          message: `Error generating agent message: ${event.content.message}`,
        },
      };
    }

    if (event.type === "block_execution") {
      const e = event.content.execution[0][0];
      if (e.error) {
        return yield {
          type: "generation_error",
          created: Date.now(),
          configurationId: configuration.sId,
          messageId: agentMessage.sId,
          error: {
            code: "agent_generation_error",
            message: `Error generating agent message: ${e.error}`,
          },
        };
      }

      if (event.content.block_name === "MODEL" && e.value) {
        const m = e.value as {
          message: {
            content: string;
          };
        };
        yield {
          type: "generation_success",
          created: Date.now(),
          configurationId: configuration.sId,
          messageId: agentMessage.sId,
          text: m.message.content,
        };
      }
    }
  }
}
