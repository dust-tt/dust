import { isMessageUnread } from "@app/components/assistant/conversation/utils";
import type {
  AgentMessageType,
  ConversationType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import type { ContentFragmentType } from "@app/types/content_fragment";

/**
 * Formats a single message for display.
 */
function formatMessage(
  msg: UserMessageType | AgentMessageType | ContentFragmentType,
  lastReadMs: number | null
) {
  const dateStr = new Date(msg.created).toISOString();
  const unreadFormatted = isMessageUnread(msg, lastReadMs) ? " (unread)" : "";

  if (msg.type === "user_message") {
    const userName = msg.user?.fullName ?? msg.user?.username ?? "User";
    const userEmail = msg.user?.email ?? "Unknown";
    const content = msg.content ?? "";
    return `>> User (${userName}, ${userEmail}) [${dateStr}]${unreadFormatted}:\n${msg.visibility === "deleted" ? "Deleted message" : content}\n`;
  }

  if (msg.type === "agent_message") {
    const agentName = msg.configuration?.name ?? "Assistant";
    const content = msg.content ?? "";
    return `>> Assistant (${agentName}) [${dateStr}]${unreadFormatted}:\n${msg.visibility === "deleted" ? "Deleted message" : content}\n`;
  }

  if (msg.type === "content_fragment") {
    return `>> Content Fragment [${dateStr}]${unreadFormatted}:\nID: ${msg.contentFragmentId}\nContent-Type: ${msg.contentType}\nTitle: ${msg.title}\nVersion: ${msg.version}\nSource URL: ${msg.sourceUrl}\n`;
  }

  return "";
}

/**
 * Formats raw conversation content into a readable text representation for display.
 * This creates a simple text representation with all messages.
 */
export function formatConversationForDisplay(
  conversation: ConversationType,
  workspaceId: string
) {
  // Convert conversation content to formatted messages
  const messages: string[] = [];

  for (const versions of conversation.content) {
    // Only take the last version of each rank
    const msg = versions[versions.length - 1];
    if (!msg) {
      continue;
    }

    const formattedMessage = formatMessage(msg, conversation.lastReadMs);
    if (formattedMessage) {
      messages.push(formattedMessage);
    }
  }

  // Format timestamps
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
    messageCount: messages.length,
    messages: messages.join("\n"),
    url: `/w/${workspaceId}/assistant/${conversation.sId}`,
  };
}

/**
 * Formats multiple conversations for display.
 */
export function formatConversationsForDisplay(
  conversations: ConversationType[],
  workspaceId: string
) {
  return conversations.map((conv) =>
    formatConversationForDisplay(conv, workspaceId)
  );
}
