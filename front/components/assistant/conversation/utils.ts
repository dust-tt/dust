import moment from "moment";

import { removeDiacritics, subFilter } from "@app/lib/utils";
import type { ConversationWithoutContentType } from "@app/types";

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
  return conversations.reduce(
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

      if (conversation.unread) {
        acc.unreadConversations.push(conversation);
        return acc;
      }

      if (conversation.actionRequired) {
        acc.actionRequiredConversations.push(conversation);
        return acc;
      }

      acc.readConversations.push(conversation);
      return acc;
    },
    {
      readConversations: [],
      unreadConversations: [],
      actionRequiredConversations: [],
    } as {
      readConversations: ConversationWithoutContentType[];
      unreadConversations: ConversationWithoutContentType[];
      actionRequiredConversations: ConversationWithoutContentType[];
    }
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
