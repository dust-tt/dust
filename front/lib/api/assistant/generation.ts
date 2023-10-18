import moment from "moment-timezone";

import {
  cloneBaseConfig,
  DustProdActionRegistry,
} from "@app/lib/actions/registry";
import { runActionStreamed } from "@app/lib/actions/server";
import {
  renderRetrievalActionForModel,
  retrievalMetaPrompt,
} from "@app/lib/api/assistant/actions/retrieval";
import {
  getSupportedModelConfig,
  GPT_4_32K_MODEL_ID,
  GPT_4_MODEL_CONFIG,
} from "@app/lib/assistant";
import { Authenticator } from "@app/lib/auth";
import { CoreAPI } from "@app/lib/core_api";
import { redisClient } from "@app/lib/redis";
import { Err, Ok, Result } from "@app/lib/result";
import logger from "@app/logger/logger";
import { isDustAppRunActionType } from "@app/types/assistant/actions/dust_app_run";
import {
  isRetrievalActionType,
  isRetrievalConfiguration,
} from "@app/types/assistant/actions/retrieval";
import { AgentConfigurationType } from "@app/types/assistant/agent";
import {
  AgentMessageType,
  ConversationType,
  isAgentMessageType,
  isContentFragmentType,
  isUserMessageType,
  UserMessageType,
} from "@app/types/assistant/conversation";

import { renderDustAppRunActionForModel } from "./actions/dust_app_run";
const CANCELLATION_CHECK_INTERVAL = 500;

/**
 * Model rendering of conversations.
 */

export type ModelMessageType = {
  role: "action" | "agent" | "user" | "content_fragment";
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
  prompt,
  allowedTokenCount,
}: {
  conversation: ConversationType;
  model: { providerId: string; modelId: string };
  prompt: string;
  allowedTokenCount: number;
}): Promise<
  Result<
    { modelConversation: ModelConversationType; tokensUsed: number },
    Error
  >
> {
  const messages: ModelMessageType[] = [];

  let retrievalFound = false;

  // Render all messages and all actions but only keep the latest retrieval action.
  for (let i = conversation.content.length - 1; i >= 0; i--) {
    const versions = conversation.content[i];
    const m = versions[versions.length - 1];

    if (isAgentMessageType(m)) {
      if (m.action) {
        if (isRetrievalActionType(m.action)) {
          if (!retrievalFound) {
            messages.unshift(renderRetrievalActionForModel(m.action));
            retrievalFound = true;
          }
        } else if (isDustAppRunActionType(m.action)) {
          messages.unshift(renderDustAppRunActionForModel(m.action));
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
    } else if (isUserMessageType(m)) {
      // Replace all `:mention[{name}]{.*}` with `@name`.
      const content = m.content.replace(
        /:mention\[(.+)\]\{.+\}/g,
        (match, name) => {
          return `@${name}`;
        }
      );
      messages.unshift({
        role: "user" as const,
        name: m.context.username,
        content,
      });
    } else if (isContentFragmentType(m)) {
      messages.unshift({
        role: "content_fragment" as const,
        name: "inject_content_fragment",
        content: `${m.title}\nCONTENT:\n${m.content}`,
      });
    } else {
      ((x: never) => {
        throw new Error(`Unexpected message type: ${x}`);
      })(m);
    }
  }

  async function tokenCountForText(
    text: string,
    model: { providerId: string; modelId: string }
  ): Promise<Result<number, Error>> {
    try {
      const res = await CoreAPI.tokenize({
        text,
        providerId: model.providerId,
        modelId: model.modelId,
      });
      if (res.isErr()) {
        return new Err(
          new Error(`Error tokenizing model message: ${res.error.message}`)
        );
      }

      return new Ok(res.value.tokens.length);
    } catch (err) {
      return new Err(new Error(`Error tokenizing model message: ${err}`));
    }
  }

  const now = Date.now();

  // Compute in parallel the token count for each message and the prompt.
  const [messagesCountRes, promptCountRes] = await Promise.all([
    // This is a bit aggressive but fuck it.
    Promise.all(
      messages.map((m) => {
        return tokenCountForText(`${m.role} ${m.name} ${m.content}`, model);
      })
    ),
    tokenCountForText(prompt, model),
  ]);

  if (promptCountRes.isErr()) {
    return new Err(promptCountRes.error);
  }

  // We initialize `tokensUsed` to the prompt tokens + a bit of buffer for message rendering
  // approximations, 64 tokens seems small enough and ample enough.
  let tokensUsed = promptCountRes.value + 64;

  // Go backward and accumulate as much as we can within allowedTokenCount.
  const selected = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const r = messagesCountRes[i];
    if (r.isErr()) {
      return new Err(r.error);
    }
    const c = r.value;
    if (tokensUsed + c <= allowedTokenCount) {
      tokensUsed += c;
      selected.unshift(messages[i]);
    }
  }

  logger.info(
    {
      workspaceId: conversation.owner.sId,
      conversationId: conversation.sId,
      messageCount: messages.length,
      promptToken: promptCountRes.value,
      tokensUsed,
      messageSelected: selected.length,
      elapsed: Date.now() - now,
    },
    "[ASSISTANT_TRACE] Genration message token counts for model conversation rendering"
  );

  return new Ok({
    modelConversation: {
      messages: selected,
    },
    tokensUsed,
  });
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

export type GenerationCancelEvent = {
  type: "generation_cancel";
  created: number;
  configurationId: string;
  messageId: string;
};

// Construct the full prompt from the agent configuration.
// - Meta data about the agent and current time.
// - Insructions from the agent configuration (in case of generation)
// - Meta data about the retrieval action (in case of retrieval)
export function constructPrompt(
  userMessage: UserMessageType,
  configuration: AgentConfigurationType,
  fallbackPrompt?: string
) {
  const d = moment(new Date()).tz(userMessage.context.timezone);

  let meta = "";
  meta += `ASSISTANT: @${configuration.name}\n`;
  meta += `LOCAL_TIME: ${d.format("YYYY-MM-DD HH:mm (ddd)")}\n`;
  if (configuration.generation) {
    meta += `INSTRUCTIONS:\n${configuration.generation.prompt}`;
  } else if (fallbackPrompt) {
    meta += `INSTRUCTIONS:\n${fallbackPrompt}`;
  }

  if (isRetrievalConfiguration(configuration.action)) {
    meta += "\n" + retrievalMetaPrompt();
  }

  return meta;
}

// This function is in charge of running the generation of a message from the agent. It does not
// create any state, only stream tokens and/or error and final success events.
export async function* runGeneration(
  auth: Authenticator,
  configuration: AgentConfigurationType,
  conversation: ConversationType,
  userMessage: UserMessageType,
  agentMessage: AgentMessageType
): AsyncGenerator<
  | GenerationErrorEvent
  | GenerationTokensEvent
  | GenerationSuccessEvent
  | GenerationCancelEvent,
  void
> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected unauthenticated call to `runGeneration`");
  }

  const c = configuration.generation;

  if (!c) {
    yield {
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
    return;
  }

  let model = c.model;

  const contextSize = getSupportedModelConfig(c.model).contextSize;

  const MIN_GENERATION_TOKENS = 2048;

  if (contextSize < MIN_GENERATION_TOKENS) {
    throw new Error(
      `Model contextSize unexpectedly small for model: ${model.providerId} ${model.modelId}`
    );
  }

  const prompt = constructPrompt(userMessage, configuration);

  // Turn the conversation into a digest that can be presented to the model.
  const modelConversationRes = await renderConversationForModel({
    conversation,
    model,
    prompt,
    allowedTokenCount: contextSize - MIN_GENERATION_TOKENS,
  });

  if (modelConversationRes.isErr()) {
    yield {
      type: "generation_error",
      created: Date.now(),
      configurationId: configuration.sId,
      messageId: agentMessage.sId,
      error: {
        code: "internal_server_error",
        message: `Failed tokenization for ${model.providerId} ${model.modelId}: ${modelConversationRes.error.message}`,
      },
    };
    return;
  }

  // If model is gpt4-32k but tokens used is less than GPT_4_CONTEXT_SIZE-MIN_GENERATION_TOKENS,
  // then we override the model to gpt4 standard (8k context, cheaper).
  if (
    model.modelId === GPT_4_32K_MODEL_ID &&
    modelConversationRes.value.tokensUsed <
      GPT_4_MODEL_CONFIG.contextSize - MIN_GENERATION_TOKENS
  ) {
    model = {
      modelId: GPT_4_MODEL_CONFIG.modelId,
      providerId: GPT_4_MODEL_CONFIG.providerId,
    };
  }

  const config = cloneBaseConfig(
    DustProdActionRegistry["assistant-v2-generator"].config
  );
  config.MODEL.provider_id = model.providerId;
  config.MODEL.model_id = model.modelId;
  config.MODEL.temperature = c.temperature;

  // This is the console.log you want to uncomment to generate inputs for the generator app.
  // console.log(
  //   JSON.stringify({
  //     conversation: modelConversationRes.value,
  //     prompt,
  //   })
  // );

  logger.info(
    {
      workspaceId: conversation.owner.sId,
      conversationId: conversation.sId,
      model: model,
      temperature: c.temperature,
    },
    "[ASSISTANT_TRACE] Generation exection"
  );

  const res = await runActionStreamed(auth, "assistant-v2-generator", config, [
    {
      conversation: modelConversationRes.value.modelConversation,
      prompt,
    },
  ]);

  if (res.isErr()) {
    yield {
      type: "generation_error",
      created: Date.now(),
      configurationId: configuration.sId,
      messageId: agentMessage.sId,
      error: {
        code: "agent_generation_error",
        message: `Error generating agent message: [${res.error.type}] ${res.error.message}`,
      },
    };
    return;
  }

  const { eventStream } = res.value;

  let shouldYieldCancel = false;
  let lastCheckCancellation = Date.now();
  const redis = await redisClient();

  const _checkCancellation = async () => {
    try {
      const cancelled = await redis.get(
        `assistant:generation:cancelled:${agentMessage.sId}`
      );
      if (cancelled === "1") {
        shouldYieldCancel = true;
        await redis.set(
          `assistant:generation:cancelled:${agentMessage.sId}`,
          0
        );
      }
    } catch (error) {
      console.error("Error checking cancellation:", error);
      return false;
    }
  };

  for await (const event of eventStream) {
    if (event.type === "error") {
      yield {
        type: "generation_error",
        created: Date.now(),
        configurationId: configuration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "agent_generation_error",
          message: `Error generating agent message: ${event.content.message}`,
        },
      };
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
        configurationId: configuration.sId,
        messageId: agentMessage.sId,
      };
      return;
    }

    if (event.type === "tokens") {
      yield {
        type: "generation_tokens",
        created: Date.now(),
        configurationId: configuration.sId,
        messageId: agentMessage.sId,
        text: event.content.tokens.text,
      };
    }

    if (event.type === "block_execution") {
      const e = event.content.execution[0][0];
      if (e.error) {
        yield {
          type: "generation_error",
          created: Date.now(),
          configurationId: configuration.sId,
          messageId: agentMessage.sId,
          error: {
            code: "agent_generation_error",
            message: `Error generating agent message: ${e.error}`,
          },
        };
        return;
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
  await redis.quit();
}
