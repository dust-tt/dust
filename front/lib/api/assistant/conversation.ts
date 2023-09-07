import {
  AgentActionEvent,
  AgentActionSuccessEvent,
  AgentErrorEvent,
  AgentGenerationSuccessEvent,
  AgentMessageNewEvent,
  AgentMessageSuccessEvent,
} from "@app/lib/api/assistant/agent";
import { GenerationTokensEvent } from "@app/lib/api/assistant/generation";
import { Authenticator } from "@app/lib/auth";
import { front_sequelize } from "@app/lib/databases";
import { AgentMessage, Message, UserMessage } from "@app/lib/models";
import { generateModelSId } from "@app/lib/utils";
import {
  AgentMessageType,
  ConversationType,
  isAgentMention,
  Mention,
  UserMessageContext,
  UserMessageType,
} from "@app/types/assistant/conversation";

/**
 * Conversation API
 */

// Event sent when the user message is created.
export type UserMessageNewEvent = {
  type: "user_message_new";
  message: UserMessageType;
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
    mentions: Mention[];
    context: UserMessageContext;
  }
): AsyncGenerator<
  | UserMessageNewEvent
  | AgentMessageNewEvent
  | AgentErrorEvent
  | AgentActionEvent
  | AgentActionSuccessEvent
  | GenerationTokensEvent
  | AgentGenerationSuccessEvent
  | AgentMessageSuccessEvent
> {
  const user = auth.user();

  let userMessage: UserMessageType | null = null;
  const agentMessages: AgentMessageType[] = [];

  await front_sequelize.transaction(async (t) => {
    let nextMessageRank =
      ((await Message.max<number | null, Message>("rank", {
        where: {
          conversationId: conversation.id,
        },
        transaction: t,
      })) ?? -1) + 1;

    const userMessageRow = await Message.create(
      {
        sId: generateModelSId(),
        rank: nextMessageRank++,
        conversationId: conversation.id,
        parentId: null,
        userMessageId: (
          await UserMessage.create(
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
      if (isAgentMention(m)) {
        const agentMessageRow = await Message.create(
          {
            sId: generateModelSId(),
            rank: nextMessageRank++,
            conversationId: conversation.id,
            parentId: userMessage.id,
            agentMessageId: (
              await AgentMessage.create({}, { transaction: t })
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
            generation: null, // TODO
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
// AgentMessage as a result)
export async function* retryAgentMessage(
  auth: Authenticator,
  {
    conversation,
    message,
  }: {
    conversation: ConversationType;
    message: AgentMessageType;
  }
): AsyncGenerator<
  | AgentMessageNewEvent
  | AgentErrorEvent
  | AgentActionEvent
  | AgentActionSuccessEvent
  | GenerationTokensEvent
  | AgentGenerationSuccessEvent
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
    message: UserMessageType;
    content: string;
  }
): AsyncGenerator<
  | UserMessageNewEvent
  | AgentMessageNewEvent
  | AgentErrorEvent
  | AgentActionEvent
  | AgentActionSuccessEvent
  | GenerationTokensEvent
  | AgentGenerationSuccessEvent
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
