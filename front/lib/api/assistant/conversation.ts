import {
  AgentActionEvent,
  AgentActionSuccessEvent,
  AgentErrorEvent,
  AgentMessageNewEvent,
  AgentMessageSuccessEvent,
  AgentMessageTokensEvent,
} from "@app/lib/api/assistant/agent";
import { Authenticator } from "@app/lib/auth";
import { CoreAPI } from "@app/lib/core_api";
import { front_sequelize } from "@app/lib/databases";
import {
  AssistantAgentMessage,
  AssistantMessage,
  AssistantUserMessage,
} from "@app/lib/models";
import { Err, Ok, Result } from "@app/lib/result";
import { generateModelSId } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { isRetrievalActionType } from "@app/types/assistant/actions/retrieval";
import {
  AssistantAgentMessageType,
  AssistantMention,
  AssistantUserMessageContext,
  AssistantUserMessageType,
  ConversationType,
  isAgentMessageType,
  isAssistantAgentMention,
  isUserMessageType,
} from "@app/types/assistant/conversation";

import { renderRetrievalActionForModel } from "./actions/retrieval";

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
      if (m.message) {
        messages.unshift({
          role: "agent" as const,
          name: m.configuration.name,
          content: m.message,
        });
      }
    }
    if (isUserMessageType(m)) {
      messages.unshift({
        role: "user" as const,
        name: m.context.username,
        content: m.message,
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

/**
 * Conversation API
 */

// Event sent when the user message is created.
export type UserMessageNewEvent = {
  type: "user_message_new";
  message: AssistantUserMessageType;
};

// This method is in charge of creating a new user message in database, running the necessary agents
// in response and updating accordingly the conversation.
export async function* postUserMessage(
  auth: Authenticator,
  {
    conversation,
    message,
    mentions,
    context,
  }: {
    conversation: ConversationType;
    message: string;
    mentions: AssistantMention[];
    context: AssistantUserMessageContext;
  }
): AsyncGenerator<
  | UserMessageNewEvent
  | AgentMessageNewEvent
  | AgentErrorEvent
  | AgentActionEvent
  | AgentActionSuccessEvent
  | AgentMessageTokensEvent
  | AgentMessageSuccessEvent
> {
  const user = auth.user();

  let userMessage: AssistantUserMessageType | null = null;
  const agentMessages: AssistantAgentMessageType[] = [];

  await front_sequelize.transaction(async (t) => {
    let nextMessageRank =
      ((await AssistantMessage.max<number | null, AssistantMessage>("rank", {
        where: {
          assistantConversationId: conversation.id,
        },
        transaction: t,
      })) ?? -1) + 1;

    const userMessageRow = await AssistantMessage.create(
      {
        sId: generateModelSId(),
        rank: nextMessageRank++,
        assistantConversationId: conversation.id,
        parentId: null,
        assistantUserMessageId: (
          await AssistantUserMessage.create(
            {
              message: message,
              userContextUsername: context.username,
              userContextTimezone: context.timezone,
              userContextFullName: context.fullName,
              userContextEmail: context.email,
              userContextProfilePictureUrl: context.profilePictureUrl,
              userId: user ? user.id : null,
            },
            { transaction: t }
          )
        ).id,
      },
      {
        transaction: t,
      }
    );

    userMessage = {
      id: userMessageRow.id,
      sId: userMessageRow.sId,
      type: "user_message",
      visibility: "visible",
      version: 0,
      user: user,
      mentions: mentions,
      message: message,
      context: context,
    };

    // for each assistant mention, create an "empty" agent message
    for (const m of mentions) {
      if (isAssistantAgentMention(m)) {
        const agentMessageRow = await AssistantMessage.create(
          {
            sId: generateModelSId(),
            rank: nextMessageRank++,
            assistantConversationId: conversation.id,
            parentId: userMessage.id,
            assistantAgentMessageId: (
              await AssistantAgentMessage.create({}, { transaction: t })
            ).id,
          },
          {
            transaction: t,
          }
        );
        agentMessages.push({
          id: agentMessageRow.id,
          sId: agentMessageRow.sId,
          type: "agent_message",
          visibility: "visible",
          version: 0,
          parentMessageId: userMessage.sId,
          status: "created",
          action: null,
          message: null,
          feedbacks: [],
          error: null,
          configuration: {
            sId: m.configurationId,
            status: "active",
            name: "foo", // TODO
            pictureUrl: null, // TODO
            action: null, // TODO
            message: null, // TODO
          },
        });
      }
    }
  });

  if (!userMessage) {
    throw new Error("Unreachable.");
  }
  yield {
    type: "user_message_new",
    message: userMessage,
  };

  for (const m of agentMessages) {
    yield {
      type: "agent_message_new",
      message: m,
      created: Date.now(),
      configurationId: m.configuration.sId,
    };
  }

  // TODO: run agents

  yield {
    type: "agent_error",
    created: Date.now(),
    configurationId: "foo",
    messageId: "bar",
    error: {
      code: "not_implemented",
      message: "Not implemented",
    },
  };
}

// This method is in charge of re-running an agent interaction (generating a new
// AssistantAgentMessage as a result)
export async function* retryAgentMessage(
  auth: Authenticator,
  {
    conversation,
    message,
  }: {
    conversation: ConversationType;
    message: AssistantAgentMessageType;
  }
): AsyncGenerator<
  | AgentMessageNewEvent
  | AgentErrorEvent
  | AgentActionEvent
  | AgentActionSuccessEvent
  | AgentMessageTokensEvent
  | AgentMessageSuccessEvent
> {
  yield {
    type: "agent_error",
    created: Date.now(),
    configurationId: "foo",
    messageId: "bar",
    error: {
      code: "not_implemented",
      message: "Not implemented",
    },
  };
}

// This method creates a new user message version (without re-running subsequent actions for now, in
// the future we will likely want to run new mentions).
export async function* editUserMessage(
  auth: Authenticator,
  {
    conversation,
    message,
    content,
  }: {
    conversation: ConversationType;
    message: AssistantUserMessageType;
    content: string;
  }
): AsyncGenerator<
  | UserMessageNewEvent
  | AgentMessageNewEvent
  | AgentErrorEvent
  | AgentActionEvent
  | AgentActionSuccessEvent
  | AgentMessageTokensEvent
  | AgentMessageSuccessEvent
> {
  yield {
    type: "agent_error",
    created: Date.now(),
    configurationId: "foo",
    messageId: "bar",
    error: {
      code: "not_implemented",
      message: "Not implemented",
    },
  };
}
