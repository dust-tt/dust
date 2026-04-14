import {
  countConversationMessages,
  renderConversationAsText,
} from "@app/lib/api/assistant/conversation/render_as_text";
import type {
  ConversationType,
  LightConversationType,
} from "@app/types/assistant/conversation";

/**
 * Formats raw conversation content into a readable text representation for display.
 * This creates a simple text representation with all messages.
 */
export function formatConversationForDisplay(
  conversation: ConversationType | LightConversationType,
  workspaceId: string
) {
  const messages = renderConversationAsText(conversation, {
    includeTimestamps: true,
    includeEmail: true,
    includeUnread: true,
  });

  const createdDate = new Date(conversation.created).toISOString();
  const updatedDate = new Date(conversation.updated).toISOString();

  return {
    sId: conversation.sId,
    title: conversation.title ?? "Untitled Conversation",
    created: createdDate,
    updated: updatedDate,
    unread: conversation.unread,
    actionRequired: conversation.actionRequired,
    hasError: conversation.hasError,
    messageCount: countConversationMessages(conversation),
    messages,
    url: `/w/${workspaceId}/assistant/${conversation.sId}`,
  };
}

/**
 * Formats multiple conversations for display.
 */
export function formatConversationsForDisplay(
  conversations: (ConversationType | LightConversationType)[],
  workspaceId: string
) {
  return conversations.map((conv) =>
    formatConversationForDisplay(conv, workspaceId)
  );
}
