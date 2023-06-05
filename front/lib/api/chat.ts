import { ChatSessionType } from "@app/types/chat";

import { Authenticator } from "../auth";
import { ChatMessage, ChatRetrievedDocument, ChatSession } from "../models";

export async function getChatSession(
  auth: Authenticator,
  cId: string
): Promise<ChatSessionType | null> {
  const owner = auth.workspace();
  if (!owner) {
    return null;
  }

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
    uId: chatSession.uId,
    sId: chatSession.sId,
    title: chatSession.title,
    messages: messages.map((m) => {
      return {
        role: m.role,
        runRetrieval: m.runRetrieval,
        runAssistant: m.runAssistant,
        message: m.message,
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
