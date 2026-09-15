import { CheckDouble, Dot, LogOut01, type MenuItem } from "@dust-tt/sparkle";

interface ConversationRowMenuArgs {
  /** Where the row stands now, which decides which way the toggle reads. */
  isUnread: boolean;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onLeave: () => void;
}

/**
 * What a conversation row offers on a right-click, wherever it is listed: the
 * read state either way round, and leaving the conversation for good.
 */
export function buildConversationRowMenuItems({
  isUnread,
  onMarkRead,
  onMarkUnread,
  onLeave,
}: ConversationRowMenuArgs): MenuItem[] {
  return [
    isUnread
      ? {
          kind: "item",
          label: "Mark as read",
          icon: CheckDouble,
          onClick: onMarkRead,
        }
      : {
          kind: "item",
          label: "Mark as unread",
          icon: Dot,
          onClick: onMarkUnread,
        },
    {
      kind: "item",
      label: "Leave the conversation",
      icon: LogOut01,
      variant: "warning",
      onClick: onLeave,
    },
  ];
}
