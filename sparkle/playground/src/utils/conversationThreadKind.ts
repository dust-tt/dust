import type { Conversation } from "../data/types";

export type ConversationThreadKind = "solo" | "group";

export interface InferConversationThreadKindContext {
  /** Set when user opened the thread from within a space (project) flow. */
  previousSpaceId?: string | null;
}

/**
 * Infers playground thread layout: solo (direct) vs group (project / space context).
 */
export function inferConversationThreadKind(
  conversation: Conversation,
  context: InferConversationThreadKindContext = {}
): ConversationThreadKind {
  if (conversation.spaceId) {
    return "group";
  }
  if (context.previousSpaceId) {
    return "group";
  }
  return "solo";
}
