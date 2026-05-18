import type { ConversationListItemType } from "@app/types/assistant/conversation";

export type ConversationDotStatus = "blocked" | "idle" | "unread";

export function getConversationDotStatus(
  conversation: ConversationListItemType
): ConversationDotStatus {
  if (conversation.actionRequired) {
    return "blocked";
  }
  if (conversation.hasError) {
    return conversation.unread ? "blocked" : "idle";
  }
  if (conversation.unread) {
    return "unread";
  }
  return "idle";
}
