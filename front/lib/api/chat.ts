import { Op } from "sequelize";

import { new_id } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/withlogging";
import {
  ChatMessageType,
  ChatRetrievedDocumentType,
  ChatSessionType,
  ChatSessionVisibility,
  MessageFeedbackStatus,
  MessageRole,
} from "@app/types/chat";
import { UserType, WorkspaceType } from "@app/types/user";

import { cloneBaseConfig, DustProdActionRegistry } from "../actions/registry";
import { runAction, runActionStreamed } from "../actions/server";
import { Authenticator, prodAPICredentialsForOwner } from "../auth";
import { DustAPI } from "../dust_api";
import {
  ChatMessage,
  ChatRetrievedDocument,
  ChatSession,
  front_sequelize,
} from "../models";

/**
 *
 * @param auth
 * @param params workspaceScope: defaults to false, which indicates to return
 * chat sessions from this user *only*. If true, return sessions from every other user
 * from the workspace (that is, *except* this user)
 * @returns
 */
export async function getChatSessions(
  auth: Authenticator,
  {
    limit,
    offset,
    workspaceScope,
  }: {
    limit: number;
    offset: number;
    workspaceScope?: boolean;
  }
): Promise<ChatSessionType[]> {
  const owner = auth.workspace();
  if (!owner) {
    return [];
  }
  const user = auth.user();
  if (!user) {
    return [];
  }
  const where = workspaceScope
    ? {
        workspaceId: owner.id,
        visibility: "workspace",
      }
    : {
        workspaceId: owner.id,
        userId: user.id,
      };
  const chatSessions = await ChatSession.findAll({
    where,
    limit,
    offset,
    order: [["createdAt", "DESC"]],
  });

  return chatSessions.map((c) => {
    return {
      id: c.id,
      userId: c.userId,
      created: c.createdAt.getTime(),
      sId: c.sId,
      title: c.title,
      messages: [],
      visibility: c.visibility,
    };
  });
}

export async function getChatSession(
  auth: Authenticator,
  sId: string
): Promise<ChatSessionType | null> {
  const owner = auth.workspace();
  if (!owner) {
    return null;
  }

  const chatSession = await ChatSession.findOne({
    where: {
      workspaceId: owner.id,
      sId,
    },
  });

  if (!chatSession) {
    return null;
  }

  return {
    id: chatSession.id,
    userId: chatSession.userId,
    created: chatSession.createdAt.getTime(),
    sId: chatSession.sId,
    title: chatSession.title,
    visibility: chatSession.visibility,
  };
}

export async function upsertChatSession(
  auth: Authenticator,
  sId: string,
  title: string | null,
  visibility: ChatSessionVisibility | null
): Promise<ChatSessionType> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  // User can be null if we are calling from API.
  const user = auth.user();

  return await front_sequelize.transaction(async (t) => {
    const [chatSession, created] = await ChatSession.findOrCreate({
      where: {
        sId,
        workspaceId: owner.id,
      },
      defaults: {
        sId,
        workspaceId: owner.id,
        userId: user?.id,
        title: title ? title : undefined,
        visibility: visibility ? visibility : "private",
      },
      transaction: t,
    });
    if (!created) {
      await chatSession.update(
        {
          title: title ? title : undefined,
        },
        { transaction: t }
      );
    }
    if (visibility && chatSession.visibility !== visibility) {
      await chatSession.update({ visibility: visibility }, { transaction: t });
    }

    const loggerArgs = {
      workspace: {
        sId: owner.sId,
        name: owner.name,
      },
      userId: user?.id,
      chatSessionId: chatSession.id,
      chatSessionCreated: created,
      visibility: visibility,
    };
    logger.info(loggerArgs, "Chat Session upserted");

    if (created) {
      const tags = [
        `workspace:${owner.sId}`,
        `workspace_name:${owner.name}`,
        // `user_id:${user?.id}`,
        // `chat_session_id:${chatSession.id}`,
      ];
      statsDClient.increment("chat_session.created", 1, tags);
    }

    return {
      id: chatSession.id,
      userId: chatSession.userId,
      created: chatSession.createdAt.getTime(),
      sId: chatSession.sId,
      title: chatSession.title,
      visibility: chatSession.visibility,
    };
  });
}

export async function getChatSessionWithMessages(
  auth: Authenticator,
  sId: string
): Promise<ChatSessionType | null> {
  const chatSession = await getChatSession(auth, sId);

  if (!chatSession) {
    return null;
  }

  // retrieve ChatMessages from ChatSession
  const messages = await ChatMessage.findAll({
    where: {
      chatSessionId: chatSession.id,
    },
    order: [["createdAt", "ASC"]],
  });

  const chatMessagesRetrieval: {
    [chatMessageId: number]: ChatRetrievedDocument[];
  } = {};

  await Promise.all(
    messages.map((m) => {
      return (async () => {
        const retreviedDocuments = await ChatRetrievedDocument.findAll({
          where: {
            chatMessageId: m.id,
          },
          order: [["score", "DESC"]],
        });
        chatMessagesRetrieval[m.id] = retreviedDocuments;
      })();
    })
  );

  return {
    ...chatSession,
    messages: messages.map((m) => {
      return {
        role: m.role,
        message: m.message,
        feedback: m.feedback,
        sId: m.sId,
        retrievals: chatMessagesRetrieval[m.id].map((r) => {
          return {
            dataSourceId: r.dataSourceId,
            sourceUrl: r.sourceUrl,
            documentId: r.documentId,
            timestamp: r.timestamp,
            tags: r.tags,
            score: r.score,
            chunks: [],
          };
        }),
      };
    }),
  };
}

export async function deleteChatSession(
  auth: Authenticator,
  sId: string
): Promise<boolean> {
  const owner = auth.workspace();
  if (!owner) {
    return false;
  }
  const nbRowsDestroyed = await ChatSession.destroy({
    where: {
      workspaceId: owner.id,
      sId,
      userId: auth.user()?.id,
    },
  });
  return nbRowsDestroyed === 1;
}

export function userIsChatSessionOwner(
  user: UserType,
  chatSession: ChatSessionType
): boolean {
  return user.id === chatSession.userId;
}

export async function getChatMessage(
  sId: string,
  chatSession: ChatSessionType
): Promise<ChatMessageType | null> {
  const chatMessage = await ChatMessage.findOne({
    where: { sId, chatSessionId: chatSession.id },
  });
  if (!chatMessage) {
    return null;
  }
  const retrievedDocuments = await ChatRetrievedDocument.findAll({
    where: {
      chatMessageId: chatMessage.id,
    },
    order: [["score", "DESC"]],
  });

  return {
    role: chatMessage.role,
    message: chatMessage.message,
    feedback: chatMessage.feedback,
    sId: chatMessage.sId,
    retrievals: retrievedDocuments.map((r) => {
      return {
        dataSourceId: r.dataSourceId,
        sourceUrl: r.sourceUrl,
        documentId: r.documentId,
        timestamp: r.timestamp,
        tags: r.tags,
        score: r.score,
        chunks: [],
      };
    }),
  };
}

export function newChatSessionId() {
  const uId = new_id();
  return uId.slice(0, 10);
}

export async function upsertChatMessage(
  session: ChatSessionType,
  m: ChatMessageType
): Promise<ChatMessageType> {
  return await front_sequelize.transaction(async (t) => {
    const [message, created] = await ChatMessage.findOrCreate({
      where: {
        sId: m.sId,
        chatSessionId: session.id,
      },
      defaults: {
        sId: m.sId,
        role: m.role,
        message: m.message,
        feedback: m.feedback,
        chatSessionId: session.id,
      },
      transaction: t,
    });
    if (!created) {
      await message.update(
        {
          role: m.role,
          message: m.message,
          feedback: m.feedback,
        },
        { transaction: t }
      );
    }

    // If the message is a retrieval, log the params (query, time range, etc.)
    // as a temp measure until it is stored in the DB.
    const loggerArgs = {
      message: { ...m, retrievals: undefined },
      userId: session.userId,
      chatSessionId: session.id,
      chatSessionSId: session.sId,
      chatSessionCreated: created,
    };
    logger.info(loggerArgs, "Retrieval occurred");

    await Promise.all(
      m.retrievals?.map((r) => {
        return (async () => {
          const [document, created] = await ChatRetrievedDocument.findOrCreate({
            where: {
              documentId: r.documentId,
              chatMessageId: message.id,
            },
            defaults: {
              dataSourceId: r.dataSourceId,
              sourceUrl: r.sourceUrl,
              documentId: r.documentId,
              timestamp: r.timestamp,
              tags: r.tags,
              score: r.score,
              chatMessageId: message.id,
            },
            transaction: t,
          });
          if (!created) {
            await document.update(
              {
                dataSourceId: r.dataSourceId,
                sourceUrl: r.sourceUrl,
                documentId: r.documentId,
                timestamp: r.timestamp,
                tags: r.tags,
                score: r.score,
                chatMessageId: message.id,
              },
              { transaction: t }
            );
          }
        })();
      }) || []
    );
    return m;
  });
}

export async function updateChatMessageFeedback({
  chatSession,
  feedback,
  sId,
}: {
  chatSession: ChatSessionType;
  feedback: MessageFeedbackStatus;
  sId: string;
}): Promise<number[]> {
  return await ChatMessage.update(
    {
      feedback: feedback,
    },
    {
      where: { sId, chatSessionId: chatSession.id },
    }
  );
}

/**
 * Chat API Implementation
 */

const filterMessagesForModel = (
  messages: ChatMessageType[]
): ChatMessageType[] => {
  // remove retrieval messages except the last one, and only keep the last 8 user messages

  const lastRetrievalMessageIndex = messages
    .map((m, i) => (m.role === "retrieval" ? i : -1))
    .filter((i) => i !== -1)
    .pop();

  const eighthButLastUserMessageIndex =
    messages
      .map((m, i) => (m.role === "user" ? i : -1))
      .filter((i) => i !== -1)
      .reverse()[7] || 0;

  const result = messages.filter(
    (m, i) =>
      i >= eighthButLastUserMessageIndex &&
      (m.role !== "retrieval" || i === lastRetrievalMessageIndex)
  );
  return result;
};

// Event sent when the session is initially created.
export type ChatSessionCreateEvent = {
  type: "chat_session_create";
  session: ChatSessionType;
};

// Event sent when we know what will be the type of the next message. It is sent initially when the
// user message is created for consistency and then each time we know we're going for a retrieval or
// an assistant response.
export type ChatMessageTriggerEvent = {
  type: "chat_message_trigger";
  role: MessageRole;
  // We might want to add some data here in the future e.g including
  // information about the query being used in the case of retrieval.
};

// Event sent once the message is fully constructed.
export type ChatMessageCreateEvent = {
  type: "chat_message_create";
  message: ChatMessageType;
};

// Event sent when receiving streamed response from the model.
export type ChatMessageTokensEvent = {
  type: "chat_message_tokens";
  messageId: string;
  text: string;
};

// Event sent when the session is updated (eg title is set).
export type ChatSessionUpdateEvent = {
  type: "chat_session_update";
  session: ChatSessionType;
};

/**
 * This function starts a new chat session.
 *
 * @param auth Authenticator
 * @param userMessage string
 * @param dataSources list of data sources to use for retrieval
 * @param filter filter to use for retrieval (timestamp)
 * @param timeZone timezone to use for retrieval must be valid
 * `Intl.DateTimeFormat`
 * @param saveSession whether to save the chats or not. Default is yes, but when
 * doing repeated testing such as in evals it can be useful to not save the session.
 */
export async function* newChat(
  auth: Authenticator,
  {
    userMessage,
    dataSources,
    filter,
    timeZone,
    context,
  }: {
    userMessage: string;
    dataSources:
      | {
          workspace_id: string;
          data_source_id: string;
        }[]
      | null;
    filter: {
      timestamp: { gt?: number; lt?: number };
    } | null;
    timeZone: string;
    context?: {
      user?: {
        username: string;
        full_name: string;
      };
      workspace?: string;
      date_today?: string;
    };
  },
  saveSession = true
): AsyncGenerator<
  | ChatSessionCreateEvent
  | ChatMessageTriggerEvent
  | ChatMessageCreateEvent
  | ChatMessageTokensEvent
  | ChatSessionUpdateEvent
> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Could not authenticate against the workspace.");
  }

  const contextWithDefaults = {
    user: {
      username: auth.user()?.username,
      full_name: auth.user()?.name,
    },
    workspace: owner.name,
    date_today: new Date().toISOString().split("T")[0],
    ...context,
  };

  const assistantConfig = cloneBaseConfig(
    DustProdActionRegistry["chat-assistant-wfn"].config
  );

  const messages: ChatMessageType[] = [
    {
      sId: new_id(),
      role: "user",
      message: userMessage,
    },
  ];

  // This is an helper function that adds an error message to the `messages` array and yield the
  // proper events in case of error.
  function* handleError(
    errorMessage: string
  ): Generator<ChatMessageTriggerEvent | ChatMessageCreateEvent> {
    messages.push({
      sId: new_id(),
      role: "error",
      message: errorMessage,
    });

    yield {
      type: "chat_message_trigger",
      role: "error",
    } as ChatMessageTriggerEvent;
    yield {
      type: "chat_message_create",
      message: messages[messages.length - 1],
    } as ChatMessageCreateEvent;
  }

  async function* runChatAssistant(
    retrievalMode: "auto" | "none"
  ): AsyncGenerator<
    ChatMessageTokensEvent | ChatMessageCreateEvent | ChatMessageTriggerEvent
  > {
    assistantConfig.MODEL.function_call = retrievalMode;
    const res = await runActionStreamed(
      auth,
      "chat-assistant-wfn",
      assistantConfig,
      [
        {
          messages: filterMessagesForModel(messages),
          context: contextWithDefaults,
        },
      ]
    );

    if (res.isErr()) {
      yield* handleError(
        `Chat error: [${res.error.type}] ${res.error.message}`
      );
      return;
    }

    const { eventStream } = res.value;

    let assistantMessageTriggered = false;

    for await (const event of eventStream) {
      if (event.type === "tokens") {
        if (!assistantMessageTriggered) {
          assistantMessageTriggered = true;
          yield {
            type: "chat_message_trigger",
            role: "assistant",
          } as ChatMessageTriggerEvent;
        }
        yield {
          type: "chat_message_tokens",
          text: event.content.tokens.text,
        } as ChatMessageTokensEvent;
      }

      if (event.type === "error") {
        yield* handleError(event.content.message);
        return;
      }

      if (event.type === "block_execution") {
        const e = event.content.execution[0][0];
        if (e.error) {
          yield* handleError(e.error);
          return;
        }

        if (event.content.block_name === "OUTPUT" && e.value) {
          const m = e.value as {
            role: MessageRole;
            message?: string;
            params?: { query: string; minTimestamp: number };
          };

          if (m.role === "assistant") {
            if (!assistantMessageTriggered) {
              assistantMessageTriggered = true;
              yield {
                type: "chat_message_trigger",
                role: "assistant",
              } as ChatMessageTriggerEvent;
            }
            yield {
              type: "chat_message_create",
              message: m,
            } as ChatMessageCreateEvent;
            messages.push({
              sId: new_id(),
              role: "assistant",
              message: m.message,
            });
          }

          if (m.role === "retrieval" && m.params?.query) {
            yield {
              type: "chat_message_trigger",
              role: "retrieval",
            } as ChatMessageTriggerEvent;
            messages.push({
              sId: new_id(),
              role: "retrieval",
              params: m.params,
            });
          }
        }
      }
    }
  }

  async function* runChatRetrieval(): AsyncGenerator<
    ChatMessageCreateEvent | ChatMessageTriggerEvent
  > {
    const m = messages[messages.length - 1];
    const configRetrieval = cloneBaseConfig(
      DustProdActionRegistry["chat-retrieval"].config
    );

    if (dataSources) {
      configRetrieval.DATASOURCE.data_sources = dataSources;
    } else {
      const prodCredentials = await prodAPICredentialsForOwner(
        owner as WorkspaceType
      );
      const api = new DustAPI(prodCredentials);

      const dsRes = await api.getDataSources(prodCredentials.workspaceId);
      if (dsRes.isErr()) {
        yield* handleError(dsRes.error.message);
        return;
      }

      const ds = dsRes.value;

      configRetrieval.DATASOURCE.data_sources = ds.map((d) => {
        return {
          workspace_id: prodCredentials.workspaceId,
          data_source_id: d.name,
        };
      });
    }

    if (filter) {
      configRetrieval.DATASOURCE.filter = filter;
    }

    const res = await runAction(auth, "chat-retrieval", configRetrieval, [
      {
        messages: [{ role: "query", message: m.params?.query }],
        userContext: {
          timeZone,
        },
      },
    ]);

    if (res.isErr()) {
      yield* handleError(
        `Chat retrieval error: [${res.error.type}] ${res.error.message}`
      );
      return;
    }

    const run = res.value;

    for (const t of run.traces) {
      if (t[1][0][0].error) {
        yield* handleError(t[1][0][0].error);
        return;
      }
      if (t[0][1] === "OUTPUT") {
        messages[messages.length - 1].retrievals = (
          t[1][0][0].value as { retrievals: ChatRetrievedDocumentType[] }
        ).retrievals;
        yield {
          type: "chat_message_create",
          message: messages[messages.length - 1],
        } as ChatMessageCreateEvent;
      }
    }
  }

  /** Run the assistant; if it decides for a retrieval, retrieve, and run the
   * assistant again with retrievalMode to none, forcing him to answer */
  yield* runChatAssistant("auto");
  if (messages[messages.length - 1].role === "retrieval") {
    yield* runChatRetrieval();
    yield* runChatAssistant("none");
  }

  /* We exit early without saving the session:
   * - if saveSession is false;
   * - If we got an error (because we don't store interactions that led to an error).*/
  if (messages[messages.length - 1].role === "error" || !saveSession) {
    return;
  }

  const sId = newChatSessionId();
  const session = await upsertChatSession(auth, sId, null, null);
  yield { type: "chat_session_create", session } as ChatSessionCreateEvent;

  for (const m of messages) {
    await upsertChatMessage(session, m);
  }

  // Update session title.
  const configTitle = cloneBaseConfig(
    DustProdActionRegistry["chat-title"].config
  );

  const contextTitle = {
    user: {
      username: auth.user()?.username,
      full_name: auth.user()?.name,
    },
    workspace: owner.name,
    date_today: new Date().toISOString().split("T")[0],
  };

  const res = await runAction(auth, "chat-title", configTitle, [
    {
      messages: messages.filter(
        (m) => m.role === "user" || m.role === "assistant"
      ),
      context: contextTitle,
    },
  ]);

  // No error handling for title, we just move on if it failed.
  if (!res.isErr()) {
    const run = res.value;

    for (const t of run.traces) {
      if (t[0][1] === "OUTPUT") {
        const title = (t[1][0][0].value as { title: string }).title;
        const session = await upsertChatSession(auth, sId, title, null);
        yield {
          type: "chat_session_update",
          session,
        } as ChatSessionUpdateEvent;
      }
    }
  }
}
