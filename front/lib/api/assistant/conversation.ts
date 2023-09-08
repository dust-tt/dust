import {
  AgentActionEvent,
  AgentActionSuccessEvent,
  AgentErrorEvent,
  AgentGenerationSuccessEvent,
  AgentMessageSuccessEvent,
  runAgent,
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
  created: number;
  messageId: string;
  message: UserMessageType;
};

// Event sent when a new message is created (empty) and the agent is about to be executed.
export type AgentMessageNewEvent = {
  type: "agent_message_new";
  created: number;
  configurationId: string;
  messageId: string;
  message: AgentMessageType;
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

  const { userMessage, agentMessages, agentMessageRows } =
    await front_sequelize.transaction(async (t) => {
      let nextMessageRank =
        ((await Message.max<number | null, Message>("rank", {
          where: {
            conversationId: conversation.id,
          },
          transaction: t,
        })) ?? -1) + 1;

      const m = await Message.create(
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

      const userMessage: UserMessageType = {
        id: m.id,
        sId: m.sId,
        type: "user_message",
        visibility: "visible",
        version: 0,
        user: user,
        mentions: mentions,
        message: message,
        context: context,
      };

      const agentMessages: AgentMessageType[] = [];
      const agentMessageRows: AgentMessage[] = [];

      // for each assistant mention, create an "empty" agent message
      for (const mention of mentions) {
        if (isAgentMention(mention)) {
          const agentMessageRow = await AgentMessage.create(
            {},
            { transaction: t }
          );
          const m = await Message.create(
            {
              sId: generateModelSId(),
              rank: nextMessageRank++,
              conversationId: conversation.id,
              parentId: userMessage.id,
              agentMessageId: agentMessageRow.id,
            },
            {
              transaction: t,
            }
          );
          agentMessageRows.push(agentMessageRow);
          agentMessages.push({
            id: m.id,
            sId: m.sId,
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
              sId: mention.configurationId,
              status: "active",
              name: "foo", // TODO
              pictureUrl: null, // TODO
              action: null, // TODO
              generation: null, // TODO
            },
          });
        }
      }

      return { userMessage, agentMessages, agentMessageRows };
    });

  if (agentMessageRows.length !== agentMessages.length) {
    throw new Error("Unreachable: agentMessageRows and agentMessages mismatch");
  }

  yield {
    type: "user_message_new",
    created: Date.now(),
    messageId: userMessage.sId,
    message: userMessage,
  };

  await Promise.allSettled(
    agentMessages.map(async function* (agentMessage, i) {
      //for (let i = 0; i < agentMessages.length; i++) {
      //const agentMessage = agentMessages[i];
      const agentMessageRow = agentMessageRows[i];

      yield {
        type: "agent_message_new",
        created: Date.now(),
        configurationId: agentMessage.configuration.sId,
        messageId: agentMessage.sId,
        message: agentMessage,
      };

      // For each agent we stitch the conversation to add the user message and only that agent message
      // so that it can be used to prompt the agent.
      const eventStream = runAgent(
        auth,
        agentMessage.configuration,
        {
          ...conversation,
          content: [...conversation.content, [userMessage], [agentMessage]],
        },
        userMessage,
        agentMessage
      );

      for await (const event of eventStream) {
        if (event.type === "agent_error") {
          // Store error in database.
          await agentMessageRow.update({
            status: "failed",
            errorCode: event.error.code,
            errorMessage: event.error.message,
          });
          yield event;
        }

        if (event.type === "agent_action_success") {
          // Store action in database.
          if (event.action.type === "retrieval_action") {
            await agentMessageRow.update({
              agentRetrievalActionId: event.action.id,
            });
          } else {
            throw new Error(
              `Action type ${event.action.type} agent_action_success handling not implemented`
            );
          }
          yield event;
        }

        if (event.type === "agent_generation_success") {
          // Store message in database.
          await agentMessageRow.update({
            message: event.text,
          });
          yield event;
        }

        if (event.type === "agent_message_success") {
          // Update status in database.
          await agentMessageRow.update({
            status: "succeeded",
          });
          yield event;
        }

        // All other events that won't impact the database and are related to actions or tokens
        // generation.
        if (
          [
            "retrieval_params",
            "retrieval_documents",
            "generation_tokens",
          ].includes(event.type)
        ) {
          yield event;
        }
      }
    })
  );
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
): AsyncGenerator<UserMessageNewEvent | AgentErrorEvent> {
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
