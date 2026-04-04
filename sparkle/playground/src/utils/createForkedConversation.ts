import { getAgentById } from "../data/agents";
import type { Conversation, ConversationMessage } from "../data/types";

export interface CreateForkedConversationParams {
  source: Conversation;
  newAgentId: string;
  locutorUserId: string;
}

function formatMessageTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * New conversation with a single locutor message carrying a reference attachment
 * to the source thread (label Conversation_{source.id}).
 */
export function createForkedConversation({
  source,
  newAgentId,
  locutorUserId,
}: CreateForkedConversationParams): Conversation {
  const now = new Date();
  const newId = `fork-${now.getTime()}-${Math.random().toString(36).slice(2, 9)}`;
  const agent = getAgentById(newAgentId);
  const title = agent ? `Chat with ${agent.name}` : "New conversation";

  const openingMessage: ConversationMessage = {
    kind: "message",
    id: `${newId}-opening`,
    timestamp: now,
    ownerId: locutorUserId,
    ownerType: "user",
    type: "user",
    group: {
      id: `${newId}-g-locutor`,
      type: "locutor",
      timestamp: formatMessageTime(now),
    },
    attachments: [
      {
        id: `${newId}-ctx-ref`,
        label: `Conversation_${source.id}`,
        icon: "document",
      },
    ],
  };

  return {
    id: newId,
    title,
    createdAt: now,
    updatedAt: now,
    userParticipants: [...source.userParticipants],
    agentParticipants: [newAgentId],
    spaceId: source.spaceId,
    description: `Forked from ${source.title}`,
    messages: [openingMessage],
  };
}
