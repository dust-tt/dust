import type { VirtuosoMessage } from "@app/components/assistant/conversation/types";
import { isZeroHeightMessage } from "@app/components/assistant/conversation/types";
import { removeDiacritics, subFilter } from "@app/lib/utils";
import type { PodConversationListItemType } from "@app/types/api/assistant/conversation/spaces";
import type {
  AgentMessageType,
  CompactionMessageType,
  ConversationForkedFromType,
  ConversationListItemType,
  ConversationWithoutContentType,
  LightAgentMessageType,
  UserMessageType,
  UserMessageTypeWithContentFragments,
} from "@app/types/assistant/conversation";
import {
  getConversationDisplayTitle,
  isPodConversation,
  isReinforcedSkillNotificationMetadata,
} from "@app/types/assistant/conversation";
import type { ContentFragmentType } from "@app/types/content_fragment";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { truncate } from "@app/types/shared/utils/string_utils";
import type { PodListItemType } from "@app/types/space";
import moment from "moment";

const MAX_SOURCE_CONVERSATION_TITLE_LENGTH = 50;
const UNNAMED_PARENT_CONVERSATION_TITLE = "Unnamed parent conversation";

const AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 4;

export interface AutoScrollState {
  isEnabled: boolean;
  hasLeftBottom: boolean;
}

export type AutoScrollEvent =
  | { type: "attach" }
  | { type: "user_scrolled_up" }
  | { type: "scroll"; bottomOffset: number };

export function getNextAutoScrollState(
  state: AutoScrollState,
  event: AutoScrollEvent
): AutoScrollState {
  switch (event.type) {
    case "attach":
      return { isEnabled: true, hasLeftBottom: false };
    case "user_scrolled_up":
      // Keep the evidence that the reader has already left the bottom when more
      // upward gestures arrive while detached.
      return state.isEnabled
        ? { isEnabled: false, hasLeftBottom: false }
        : state;
    case "scroll": {
      if (state.isEnabled) {
        return state;
      }

      const isAtBottom = event.bottomOffset <= AUTO_SCROLL_BOTTOM_THRESHOLD_PX;
      if (!isAtBottom) {
        return state.hasLeftBottom ? state : { ...state, hasLeftBottom: true };
      }

      // A smooth scroll can still report the bottom while it is being cancelled.
      // Only re-attach after the detached viewport was observed away from it.
      return state.hasLeftBottom
        ? { isEnabled: true, hasLeftBottom: false }
        : state;
    }
    default:
      return assertNever(event);
  }
}

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
  titleFilter: string,
  activeConversationId: string | null
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
            } else if (
              conversation.triggerId !== null ||
              conversation.nextWakeupAt !== null
            ) {
              acc.triggeredConversations.push(conversation);
            } else if (
              conversation.sId === activeConversationId &&
              !conversation.actionRequired
            ) {
              // The conversation being viewed cannot be unread for its viewer: the server only
              // reports it unread while the debounced mark-as-read has not landed yet. Keep it
              // out of the inbox so it does not flash there while the agent responds.
              acc.readConversations.push(conversation);
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
          triggeredConversations: [],
        } as {
          readConversations: ConversationListItemType[];
          inboxConversations: ConversationListItemType[];
          skillSuggestionConversations: ConversationListItemType[];
          triggeredConversations: ConversationListItemType[];
        }
      )
  );
}

export function getGroupConversationsByDate<
  T extends ConversationListItemType | PodConversationListItemType,
>({ conversations, titleFilter }: { conversations: T[]; titleFilter: string }) {
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

export function filterReadTriggeredConversations(
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

/**
 * Group unread conversations for the sidebar inbox sections:
 * 1. Non-pod conversations first
 * 2. Pod conversations grouped by pod name
 * 3. Within each group, by updatedAt descending
 */
type UnreadConversationGroup =
  | {
      type: "non_pod";
      conversations: ConversationListItemType[];
    }
  | {
      type: "pod";
      spaceId: string;
      podName: string;
      conversations: ConversationListItemType[];
    };

export function groupUnreadConversations(
  conversations: ConversationListItemType[],
  pods: PodListItemType[]
): UnreadConversationGroup[] {
  const podNameById = new Map(pods.map((pod) => [pod.sId, pod.name]));

  const sorted = conversations.toSorted((a, b) => {
    const aIsPod = isPodConversation(a);
    const bIsPod = isPodConversation(b);

    if (aIsPod !== bIsPod) {
      return aIsPod ? 1 : -1;
    }

    if (aIsPod && bIsPod) {
      const aName = podNameById.get(a.spaceId) ?? "";
      const bName = podNameById.get(b.spaceId) ?? "";
      const nameCmp = aName.localeCompare(bName);
      if (nameCmp !== 0) {
        return nameCmp;
      }
    }

    return b.updated - a.updated;
  });

  const groups: UnreadConversationGroup[] = [];

  for (const conversation of sorted) {
    if (!isPodConversation(conversation)) {
      const lastGroup = groups[groups.length - 1];
      if (lastGroup?.type === "non_pod") {
        lastGroup.conversations.push(conversation);
      } else {
        groups.push({ type: "non_pod", conversations: [conversation] });
      }
      continue;
    }

    const lastGroup = groups[groups.length - 1];
    if (
      lastGroup?.type === "pod" &&
      lastGroup.spaceId === conversation.spaceId
    ) {
      lastGroup.conversations.push(conversation);
    } else {
      groups.push({
        type: "pod",
        spaceId: conversation.spaceId,
        podName: podNameById.get(conversation.spaceId) ?? "",
        conversations: [conversation],
      });
    }
  }

  return groups;
}

export function findFirstUnreadMessageIndex(
  messages: VirtuosoMessage[],
  lastReadMs: number
): number {
  return messages.findIndex((m) => {
    // Zero-height rows deadlock VirtuosoMessageList when used as the initial
    // scroll target. Scroll to the first unread message that actually renders instead.
    if (isZeroHeightMessage(m)) {
      return false;
    }
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

type CompactionConversationInput = Pick<
  ConversationWithoutContentType,
  "forkingData" | "sId"
>;

export function getParentConversationTitleLabel(
  parentConversation: Pick<
    ConversationForkedFromType,
    "parentConversationTitle"
  >
): string {
  return (
    parentConversation.parentConversationTitle ??
    UNNAMED_PARENT_CONVERSATION_TITLE
  );
}

function getCompactionParentConversation(
  message: CompactionMessageType,
  conversation: CompactionConversationInput
): ConversationForkedFromType | null {
  if (
    !message.sourceConversationId ||
    message.sourceConversationId === conversation.sId
  ) {
    return null;
  }

  const parentConversation = conversation.forkingData?.forkedFrom;
  if (
    parentConversation?.parentConversationId !== message.sourceConversationId
  ) {
    return null;
  }

  return parentConversation;
}

export function getCompactionInProgressLabel(
  message: CompactionMessageType,
  conversation: CompactionConversationInput
): string {
  const parentConversation = getCompactionParentConversation(
    message,
    conversation
  );

  if (!parentConversation) {
    return "Compacting context, this may take a moment…";
  }

  const parentConversationTitle =
    getParentConversationTitleLabel(parentConversation);
  const truncatedParentConversationTitle = truncate(
    parentConversationTitle,
    MAX_SOURCE_CONVERSATION_TITLE_LENGTH
  );

  return `Summarizing '${truncatedParentConversationTitle}', this may take a moment…`;
}

export function getCompactionSuccessLabel(
  message: CompactionMessageType,
  conversation: CompactionConversationInput
): string {
  if (
    !message.sourceConversationId ||
    message.sourceConversationId === conversation.sId
  ) {
    return "Context compacted";
  }

  const parentConversation = getCompactionParentConversation(
    message,
    conversation
  );
  if (parentConversation) {
    const parentConversationTitle =
      getParentConversationTitleLabel(parentConversation);
    const truncatedParentConversationTitle = truncate(
      parentConversationTitle,
      MAX_SOURCE_CONVERSATION_TITLE_LENGTH
    );

    return `Summarized '${truncatedParentConversationTitle}' here`;
  }

  return "Summarized another conversation here";
}
