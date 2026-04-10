import { removeDiacritics, subFilter } from "@app/lib/utils";
import type {
  AgentMessageType,
  CompactionMessageType,
  ConversationWithoutContentType,
  LightAgentMessageType,
  UserMessageType,
  UserMessageTypeWithContentFragments,
} from "@app/types/assistant/conversation";
import type { ContentFragmentType } from "@app/types/content_fragment";
import moment from "moment";

import { isAgentMessageWithStreaming } from "./types";
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

interface SteerGroupInfo {
  isSteeredAgentMessage: boolean;
  steerGroupId: string | null;
  /** Total duration from the root's creation to the last message's completion. Null if group is still running. */
  groupDurationMs: number | null;
  /** True when every agent message in the steered chain has finished. */
  isGroupComplete: boolean;
}

/**
 * Determine whether an agent message belongs to a steered chain and compute
 * the shared group ID (the sId of the first agent message in the chain).
 *
 * A steered chain is a sequence of agent messages from the same configuration
 * where intermediate ones have status "gracefully_stopped" or "created".
 */
export function getSteerGroupInfo({
  messages,
  messageSId,
  configurationId,
  agentStatus,
}: {
  messages: VirtuosoMessage[];
  messageSId: string;
  configurationId: string;
  agentStatus: string;
}): SteerGroupInfo {
  const currentIndex = messages.findIndex((m) => m.sId === messageSId);

  let isSteered = false;
  let groupRoot: string | null = null;

  // Walk backwards to find if this message is steered and find the group root.
  for (let i = currentIndex - 1; i >= 0; i--) {
    const m = messages[i];
    if (isAgentMessageWithStreaming(m)) {
      if (
        (m.status === "gracefully_stopped" || m.status === "created") &&
        m.configuration.sId === configurationId
      ) {
        isSteered = true;
        groupRoot = m.sId;
        // Keep walking to find the true root of the chain.
        for (let j = i - 1; j >= 0; j--) {
          const prev = messages[j];
          if (isAgentMessageWithStreaming(prev)) {
            if (
              (prev.status === "gracefully_stopped" ||
                prev.status === "created") &&
              prev.configuration.sId === configurationId
            ) {
              groupRoot = prev.sId;
            } else {
              break;
            }
          }
        }
      }
      break;
    }
  }

  // If this message is not steered itself, check if there's a steered message
  // after it to determine if it's the root of a group.
  if (!isSteered) {
    for (let i = currentIndex + 1; i < messages.length; i++) {
      const m = messages[i];
      if (isAgentMessageWithStreaming(m)) {
        if (
          m.configuration.sId === configurationId &&
          (agentStatus === "gracefully_stopped" || agentStatus === "created")
        ) {
          groupRoot = messageSId;
        }
        break;
      }
    }
  }

  // Compute total duration and completion status across the steered chain.
  let groupDurationMs: number | null = null;
  let isGroupComplete = false;
  if (groupRoot) {
    const rootMsg = messages.find((m) => m.sId === groupRoot);
    // Collect all agent messages in the chain from root forward.
    const rootIndex = messages.findIndex((m) => m.sId === groupRoot);
    let lastMsg = rootIndex >= 0 ? messages[rootIndex] : null;
    let allDone = lastMsg
      ? isAgentMessageWithStreaming(lastMsg) && lastMsg.status !== "created"
      : false;

    for (
      let i = (rootIndex >= 0 ? rootIndex : currentIndex) + 1;
      i < messages.length;
      i++
    ) {
      const m = messages[i];
      if (isAgentMessageWithStreaming(m)) {
        if (m.configuration.sId === configurationId) {
          lastMsg = m;
          if (m.status === "created") {
            allDone = false;
          }
        }
        // Stop at first agent message not in this chain.
        if (m.configuration.sId !== configurationId) {
          break;
        }
      }
    }

    isGroupComplete = allDone;
    if (
      rootMsg &&
      lastMsg &&
      isAgentMessageWithStreaming(lastMsg) &&
      lastMsg.completedTs !== null
    ) {
      groupDurationMs = lastMsg.completedTs - rootMsg.created;
    }
  }

  return {
    isSteeredAgentMessage: isSteered,
    steerGroupId: groupRoot,
    groupDurationMs,
    isGroupComplete,
  };
}
