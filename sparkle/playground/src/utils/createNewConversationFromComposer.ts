import { getAgentAvatarProps } from "../data/agentAvatarProps";
import { getAgentById } from "../data/agents";
import type {
  Conversation,
  ConversationActiveIndicator,
  ConversationMessage,
} from "../data/types";

function formatMessageTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export interface CreateNewConversationFromComposerParams {
  locutorUserId: string;
  agentId: string;
  messageText: string;
}

/**
 * Conversation seeded from the welcome composer: locutor message + agent typing indicator.
 */
export function createNewConversationFromComposer({
  locutorUserId,
  agentId,
  messageText,
}: CreateNewConversationFromComposerParams): Conversation {
  const now = new Date();
  const newId = `composer-${now.getTime()}-${Math.random().toString(36).slice(2, 9)}`;
  const agent = getAgentById(agentId);
  const title = agent ? `Chat with ${agent.name}` : "New conversation";
  const trimmed = messageText.trim();

  const userMessage: ConversationMessage = {
    kind: "message",
    id: `${newId}-user-1`,
    timestamp: now,
    content: trimmed,
    ownerId: locutorUserId,
    ownerType: "user",
    type: "user",
    group: {
      id: `${newId}-g-locutor`,
      type: "locutor",
      timestamp: formatMessageTime(now),
    },
  };

  const typingIndicator: ConversationActiveIndicator = {
    kind: "activeIndicator",
    id: `${newId}-agent-typing`,
    type: "agent",
    name: agent?.name,
    action: "typing",
    avatar: agent
      ? getAgentAvatarProps(agent)
      : {
          emoji: "🤖",
          backgroundColor: "s-bg-muted-background",
        },
  };

  return {
    id: newId,
    title,
    createdAt: now,
    updatedAt: now,
    userParticipants: [locutorUserId],
    agentParticipants: [agentId],
    messages: [userMessage, typingIndicator],
  };
}
