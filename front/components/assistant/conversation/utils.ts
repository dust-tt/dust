import { removeDiacritics, subFilter } from "@app/lib/utils";
import type {
  AgentMessageType,
  CompactionMessageType,
  ConversationListItemType,
  LightAgentMessageType,
  UserMessageType,
  UserMessageTypeWithContentFragments,
} from "@app/types/assistant/conversation";
import {
  getConversationDisplayTitle,
  isReinforcedSkillNotificationMetadata,
} from "@app/types/assistant/conversation";
import type { ContentFragmentType } from "@app/types/content_fragment";
import moment from "moment";

import type { VirtuosoMessage } from "./types";

function isReinforcedSkillConversation(
  conversation: ConversationListItemType
): boolean {
  return isReinforcedSkillNotificationMetadata(
    conversation.metadata?.reinforcedSkillNotification
  );
}

type GroupLabel =
  | "Today"
  | "Yesterday"
  | "Last Week"
  | "Last Month"
  | "Last 12 Months"
  | "Older";

// We treat the conversations as unread if they are unread or have an action required
// (note that action required conversations are never marked as unread).
// Unread reinforced-skill-notification conversations are split out into their own bucket so
// the sidebar can show them in a dedicated "Skill suggestions" section above the Inbox; once
// read they fall back into the date-grouped Conversations list like any other read conversation.
export function getGroupConversationsByUnreadAndActionRequired(
  conversations: ConversationListItemType[],
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
              removeDiacritics(
                getConversationDisplayTitle(conversation)
              ).toLowerCase()
            )
          ) {
            return acc;
          }

          if (conversation.unread || conversation.actionRequired) {
            if (isReinforcedSkillConversation(conversation)) {
              acc.skillSuggestionConversations.push(conversation);
            } else {
              acc.inboxConversations.push(conversation);
            }
            return acc;
          }

          acc.readConversations.push(conversation);
          return acc;
        },
        {
          readConversations: [],
          inboxConversations: [],
          skillSuggestionConversations: [],
        } as {
          readConversations: ConversationListItemType[];
          inboxConversations: ConversationListItemType[];
          skillSuggestionConversations: ConversationListItemType[];
        }
      )
  );
}

export function getGroupConversationsByDate<T extends ConversationListItemType>({
  conversations,
  titleFilter,
}: {
  conversations: T[];
  titleFilter: string;
}) {
  const today = moment().startOf("day");
  const yesterday = moment().subtract(1, "days").startOf("day");
  const lastWeek = moment().subtract(1, "weeks").startOf("day");
  const lastMonth = moment().subtract(1, "months").startOf("day");
  const lastYear = moment().subtract(1, "years").startOf("day");

  const groups: Record<GroupLabel, T[]> = {
    Today: [],
    Yesterday: [],
    "Last Week": [],
    "Last Month": [],
    "Last 12 Months": [],
    Older: [],
  };

  conversations.forEach((conversation: T) => {
    if (
      titleFilter &&
      !subFilter(
        removeDiacritics(titleFilter).toLowerCase(),
        removeDiacritics(
          getConversationDisplayTitle(conversation)
        ).toLowerCase()
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
  conversations: ConversationListItemType[],
  hideTriggered: boolean
): ConversationListItemType[] {
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
    | UserMessageTypeWithContentFragments
    | CompactionMessageType,
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
