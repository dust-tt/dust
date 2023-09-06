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
import { AssistantMessage, AssistantUserMessage } from "@app/lib/models";
import { Err, Ok, Result } from "@app/lib/result";
import { generateModelSId } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { isRetrievalActionType } from "@app/types/assistant/actions/retrieval";
import {
  AssistantAgentMessageType,
  AssistantConversationType,
  AssistantMention,
  AssistantUserMessageContext,
  AssistantUserMessageType,
  isAgentMessageType,
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
  conversation: AssistantConversationType;
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
    conversation: AssistantConversationType;
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
  if (!user) {
    // TBD
    throw new Error("User not found");
  }

  const transaction = await front_sequelize.transaction();

  const lastMessageRank = await AssistantMessage.max<
    number | null,
    AssistantMessage
  >("rank", {
    where: {
      assistantConversationId: conversation.id,
    },
    transaction,
  });

  const newUserMessage = await AssistantUserMessage.create(
    {
      message: message,
      userContextUsername: context.username,
      userContextTimezone: context.timezone,
      userContextFullName: context.fullName,
      userContextEmail: context.email,
      userContextProfilePictureUrl: context.profilePictureUrl,
      userId: user.id,
    },
    {
      transaction,
    }
  );
  const newMessage = await AssistantMessage.create(
    {
      sId: generateModelSId(),
      rank: lastMessageRank ? lastMessageRank + 1 : 0,
      assistantConversationId: conversation.id,
      parentId: null,
      assistantUserMessageId: newUserMessage.id,
    },
    {
      transaction,
    }
  );

  try {
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }

  yield {
    type: "user_message_new",
    message: {
      id: newUserMessage.id,
      sId: newMessage.sId,
      visibility: "visible",
      version: 0,
      parentMessageId: null,
      user: user,
      mentions: mentions,
      message: message,
      context: context,
    },
  };

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
    conversation: AssistantConversationType;
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
    conversation: AssistantConversationType;
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
