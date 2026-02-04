import moment from "moment";

import { removeDiacritics, subFilter } from "@app/lib/utils";
import type {
  AgentMessageType,
  ContentFragmentType,
  ConversationWithoutContentType,
  LightAgentMessageType,
  UserMessageType,
  UserMessageTypeWithContentFragments,
} from "@app/types";

import type { VirtuosoMessage } from "./types";

type GroupLabel =
  | "Today"
  | "Yesterday"
  | "Last Week"
  | "Last Month"
  | "Last 12 Months"
  | "Older";

// We treat the conversations as unread if they are unread or have an action required
// (note that action required conversations are never marked as unread).
export function getGroupConversationsByUnreadAndActionRequired(
  conversations: ConversationWithoutContentType[],
  titleFilter: string
) {
  return (
    conversations
      // Ensure that the conversations are always sorted by updated time as the list might have been manipulated client-side.
      .toSorted((a, b) => b.updated - a.updated)
      .reduce(
        (acc, conversation) => {
          if (
            titleFilter &&
            !subFilter(
              removeDiacritics(titleFilter).toLowerCase(),
              removeDiacritics(conversation.title ?? "").toLowerCase()
            )
          ) {
            return acc;
          }

          if (conversation.unread || conversation.actionRequired) {
            acc.inboxConversations.push(conversation);
            return acc;
          }

          acc.readConversations.push(conversation);
          return acc;
        },
        {
          readConversations: [],
          inboxConversations: [],
        } as {
          readConversations: ConversationWithoutContentType[];
          inboxConversations: ConversationWithoutContentType[];
        }
      )
  );
}

export function getGroupConversationsByDate({
  conversations,
  titleFilter,
}: {
  conversations: ConversationWithoutContentType[];
  titleFilter: string;
}) {
  const today = moment().startOf("day");
  const yesterday = moment().subtract(1, "days").startOf("day");
  const lastWeek = moment().subtract(1, "weeks").startOf("day");
  const lastMonth = moment().subtract(1, "months").startOf("day");
  const lastYear = moment().subtract(1, "years").startOf("day");

  const groups: Record<GroupLabel, ConversationWithoutContentType[]> = {
    Today: [],
    Yesterday: [],
    "Last Week": [],
    "Last Month": [],
    "Last 12 Months": [],
    Older: [],
  };

  conversations.forEach((conversation: ConversationWithoutContentType) => {
    if (
      titleFilter &&
      !subFilter(
        removeDiacritics(titleFilter).toLowerCase(),
        removeDiacritics(conversation.title ?? "").toLowerCase()
      )
    ) {
      return;
    }

    const updatedAt = moment(conversation.updated ?? conversation.created);
    if (updatedAt.isSameOrAfter(today)) {
      groups["Today"].push(conversation);
    } else if (updatedAt.isSameOrAfter(yesterday)) {
      groups["Yesterday"].push(conversation);
    } else if (updatedAt.isSameOrAfter(lastWeek)) {
      groups["Last Week"].push(conversation);
    } else if (updatedAt.isSameOrAfter(lastMonth)) {
      groups["Last Month"].push(conversation);
    } else if (updatedAt.isSameOrAfter(lastYear)) {
      groups["Last 12 Months"].push(conversation);
    } else {
      groups["Older"].push(conversation);
    }
  });

  return groups;
}

export function filterTriggeredConversations(
  conversations: ConversationWithoutContentType[],
  hideTriggered: boolean
): ConversationWithoutContentType[] {
  if (!hideTriggered) {
    return conversations;
  }

  return conversations.filter(
    (c) => c.triggerId === null || c.unread || c.actionRequired
  );
}

export function findFirstUnreadMessageIndex(
  messages: VirtuosoMessage[],
  lastReadMs: number
): number {
  return messages.findIndex((m) => {
    if (m.created > lastReadMs) {
      return true;
    }
    if (m.type === "agent_message" && (m.completedTs ?? 0) > lastReadMs) {
      return true;
    }
    return false;
  });
}

export function isMessageUnread(
  message:
    | UserMessageType
    | AgentMessageType
    | ContentFragmentType
    | LightAgentMessageType
    | UserMessageTypeWithContentFragments,
  lastReadMs: number | null
): boolean {
  if (lastReadMs === null) {
    return true;
  }
  if (message.created > lastReadMs) {
    return true;
  }
  if (
    message.type === "agent_message" &&
    (message.completedTs ?? 0) > lastReadMs
  ) {
    return true;
  }
  return false;
}
