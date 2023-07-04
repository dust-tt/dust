import { new_id } from "@app/lib/utils";
import {
  ChatMessageType,
  ChatSessionType,
  MessageFeedbackStatus,
} from "@app/types/chat";
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

export async function getChatSession({
  owner,
  user,
  sId,
}: {
  owner: WorkspaceType;
  user: UserType | null;
  sId: string;
}): Promise<ChatSessionType | null> {
  const whereClause: {
    workspaceId: number;
    sId: string;
    userId?: number;
  } = {
    workspaceId: owner.id,
    sId,
  };

  if (user) {
    whereClause.userId = user.id;
  }

  const chatSession = await ChatSession.findOne({
    where: whereClause,
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
  };
}

export async function getChatSessionWithMessages({
  owner,
  user,
  sId,
}: {
  owner: WorkspaceType;
  user: UserType | null;
  sId: string;
}): Promise<ChatSessionType | null> {
  user = null;
  const chatSession = await getChatSession({ owner, user, sId });

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
export async function storeChatSession(
  sId: string,
  owner: WorkspaceType,
  user: UserType,
  title: string | null
): Promise<ChatSessionType> {
  const [chatSession] = await ChatSession.upsert({
    sId,
    workspaceId: owner.id,
    userId: user.id,
    title: title ? title : undefined,
  });

  return {
    id: chatSession.id,
    userId: chatSession.userId,
    created: chatSession.createdAt.getTime(),
    sId: chatSession.sId,
    title: chatSession.title,
  };
}
