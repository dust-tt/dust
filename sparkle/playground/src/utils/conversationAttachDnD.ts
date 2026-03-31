import type { DragEvent } from "react";

import type { Conversation } from "../data/types";

/** Custom drag payload for attaching a playground conversation to the InputBar. */
export const CONVERSATION_ATTACH_MIME =
  "application/x-dust-playground-conversation";

/** Props to spread on `NavigationListItem` for sidebar conversation rows (Project stories). */
export function conversationRowDragProps(conversation: Conversation) {
  return {
    draggable: true as const,
    className: "s-cursor-grab active:s-cursor-grabbing",
    onDragStart: (e: DragEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest('[data-sidebar="menu-action"]')) {
        e.preventDefault();
        return;
      }
      setConversationDragData(e.dataTransfer, conversation.id);
    },
  };
}

export function setConversationDragData(
  dataTransfer: DataTransfer,
  conversationId: string
): void {
  dataTransfer.setData(CONVERSATION_ATTACH_MIME, conversationId);
  dataTransfer.effectAllowed = "copy";
}

export function getConversationIdFromDataTransfer(
  dataTransfer: DataTransfer
): string | null {
  if (!dataTransfer.types.includes(CONVERSATION_ATTACH_MIME)) {
    return null;
  }
  const id = dataTransfer.getData(CONVERSATION_ATTACH_MIME).trim();
  return id.length > 0 ? id : null;
}
