import { new_id } from "@app/lib/utils";
import { ChatMessageType, ChatSessionType } from "@app/types/chat";
import { UserType, WorkspaceType } from "@app/types/user";

import {
  ChatMessage,
  ChatRetrievedDocument,
  ChatSession,
  front_sequelize,
} from "../models";

export async function getChatSessions(
  owner: WorkspaceType,
  user: UserType,
  limit: number,
  offset: number
): Promise<ChatSessionType[]> {
  const chatSessions = await ChatSession.findAll({
    where: {
      workspaceId: owner.id,
      userId: user.id,
    },
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
    };
  });
}

export async function getChatSession(
  owner: WorkspaceType,
  cId: string
): Promise<ChatSessionType | null> {
  const chatSession = await ChatSession.findOne({
    where: {
      workspaceId: owner.id,
      sId: cId,
    },
  });

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
    id: chatSession.id,
    userId: chatSession.userId,
    created: chatSession.createdAt.getTime(),
    sId: chatSession.sId,
    title: chatSession.title,
    messages: messages.map((m) => {
      return {
        id: m.id,
        role: m.role,
        message: m.message,
        feedback: m.feedback,
        mId: m.mId,
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

export async function getChatMessage(
  sessionId: number,
  mId: string
): Promise<ChatMessageType | null> {
  const chatMessage = await ChatMessage.findOne({
    where: {
      chatSessionId: sessionId,
      mId,
    },
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
    mId: chatMessage.mId,
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
  sessionId: number,
  m: ChatMessageType,
  mId: string
): Promise<ChatMessageType> {
  return await front_sequelize.transaction(async (t) => {
    const [message, _] = await ChatMessage.upsert(
      {
        mId,
        chatSessionId: sessionId,
        role: m.role,
        message: m.message,
        feedback: m.feedback,
      },
      { transaction: t }
    );

    await Promise.all(
      m.retrievals?.map((r) => {
        return (async () => {
          await ChatRetrievedDocument.upsert(
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
        })();
      }) || []
    );
    return m;
  });
}
export async function storeChatSession(
  sId: string,
  owner: WorkspaceType,
  user: UserType,
  title: string | null,
  messages: ChatMessageType[]
): Promise<ChatSessionType> {
  return await front_sequelize.transaction(async (t) => {
    // Start by cleaning up the previous chat session
    const oldSession = await ChatSession.findOne({
      where: {
        workspaceId: owner.id,
        sId,
      },
      transaction: t,
    });

    if (oldSession) {
      // destroy all chat messages and retrived documents
      await Promise.all(
        (
          await ChatMessage.findAll({
            where: {
              chatSessionId: oldSession.id,
            },
            transaction: t,
          })
        ).map((m) => {
          return (async () => {
            await ChatRetrievedDocument.destroy({
              where: {
                chatMessageId: m.id,
              },
              transaction: t,
            });
            await ChatMessage.destroy({
              where: {
                id: m.id,
              },
              transaction: t,
            });
          })();
        })
      );

      // destroy the chat session
      await ChatSession.destroy({
        where: {
          id: oldSession.id,
        },
        transaction: t,
      });
    }

    const chatSession = await ChatSession.create(
      {
        sId,
        workspaceId: owner.id,
        userId: user.id,
        title: title ? title : undefined,
      },
      { transaction: t }
    );
    await Promise.all(
      messages.map((m) => {
        return (async () => {
          const chatMessage = await ChatMessage.create(
            {
              role: m.role,
              mId: m.mId,
              message: m.message,
              chatSessionId: chatSession.id,
              feedback: m.feedback,
            },
            { transaction: t }
          );
          await Promise.all(
            m.retrievals?.map((r) => {
              return (async () => {
                await ChatRetrievedDocument.create(
                  {
                    dataSourceId: r.dataSourceId,
                    sourceUrl: r.sourceUrl,
                    documentId: r.documentId,
                    timestamp: r.timestamp,
                    tags: r.tags,
                    score: r.score,
                    chatMessageId: chatMessage.id,
                  },
                  { transaction: t }
                );
              })();
            }) || []
          );
        })();
      })
    );

    return {
      id: chatSession.id,
      userId: chatSession.userId,
      created: chatSession.createdAt.getTime(),
      sId: chatSession.sId,
      title: chatSession.title,
      messages,
    };
  });
}
