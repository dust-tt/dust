import {
  Check,
  CheckDouble,
  Dot,
  LogOut01,
  type MenuItem,
} from "@dust-tt/sparkle";

interface ConversationRowMenuArgs {
  /** Where the row stands now, which decides which way the toggle reads. */
  isUnread: boolean;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  /**
   * Takes the row out of the list on the spot. Left out where a list has
   * nowhere to put it — or where the row is an agent still at work, which is
   * not yours to file away yet.
   */
  onClear?: () => void;
  onLeave: () => void;
}

/**
 * What a conversation row offers on a right-click, wherever it is listed: the
 * read state either way round, clearing the row where a list allows it, and
 * leaving the conversation for good.
 */
export function buildConversationRowMenuItems({
  isUnread,
  onMarkRead,
  onMarkUnread,
  onClear,
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
    ...(onClear
      ? [
          {
            kind: "item" as const,
            label: "Clear",
            icon: Check,
            onClick: onClear,
          },
        ]
      : []),
    {
      kind: "item",
      label: "Leave the conversation",
      icon: LogOut01,
      variant: "warning",
      onClick: onLeave,
    },
  ];
}
