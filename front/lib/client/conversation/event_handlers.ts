import type {
  AgentMessageNewEvent,
  AgentMessageWithRankType,
  UserMessageNewEvent,
  UserMessageWithRankType,
} from "@dust-tt/types";
import { isAgentMessageType, isUserMessageType } from "@dust-tt/types";
import { cloneDeep } from "lodash";

import type { FetchConversationMessagesResponse } from "@app/lib/api/assistant/messages";
import type { FetchConversationParticipantsResponse } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/participants";

/**
 * If no message pages exist, create a single page with the optimistic message.
 * If message pages exist, add the optimistic message to the first page, since
 * the message pages array is not yet reversed.
 */
export function updateMessagePagesWithOptimisticData(
  currentMessagePages: FetchConversationMessagesResponse[] | undefined,
  messageOrPlaceholder: AgentMessageWithRankType | UserMessageWithRankType
): FetchConversationMessagesResponse[] {
  if (!currentMessagePages || currentMessagePages.length === 0) {
    return [
      {
        messages: [messageOrPlaceholder],
        hasMore: false,
        lastValue: null,
      },
    ];
  }

  // We need to deep clone here, since SWR relies on the reference.
  const updatedMessages = cloneDeep(currentMessagePages);
  updatedMessages.at(0)?.messages.push(messageOrPlaceholder);

  return updatedMessages;
}

// Function to update the message pages with the new message from the event.
export function getUpdatedMessagesFromEvent(
  currentMessagePages: FetchConversationMessagesResponse[] | undefined,
  event: AgentMessageNewEvent | UserMessageNewEvent
) {
  if (!currentMessagePages) {
    return undefined;
  }

  // Check if the message already exists in the cache.
  const isMessageAlreadyInCache = currentMessagePages.some((page) =>
    page.messages.some((message) => message.sId === event.message.sId)
  );

  // If the message is already in the cache, ignore the event.
  if (isMessageAlreadyInCache) {
    return currentMessagePages;
  }

  const { rank } = event.message;

  // We only support adding at the end of the first page.
  const [firstPage] = currentMessagePages;
  const firstPageLastMessage = firstPage.messages.at(-1);
  if (firstPageLastMessage && firstPageLastMessage.rank < rank) {
    return updateMessagePagesWithOptimisticData(
      currentMessagePages,
      event.message
    );
  }

  return currentMessagePages;
}

// Function to update the participants with the new message from the event.
export function getUpdatedParticipantsFromEvent(
  participants: FetchConversationParticipantsResponse | undefined,
  event: AgentMessageNewEvent | UserMessageNewEvent
) {
  if (!participants) {
    return undefined;
  }

  const { message } = event;
  if (isUserMessageType(message)) {
    const { user } = message;
    const isAlreadyParticipant = participants.participants.users.some(
      (u) => u.username === message.user?.username
    );

    if (!user || isAlreadyParticipant) {
      return participants;
    } else {
      participants.participants.users.push({
        username: user.username,
        fullName: user.fullName,
        pictureUrl: user.image,
      });
    }
  } else if (isAgentMessageType(message)) {
    const { configuration } = message;
    const isAlreadyParticipant = participants.participants.agents.some(
      (a) => a.configurationId === configuration.sId
    );

    if (isAlreadyParticipant) {
      return participants;
    } else {
      participants.participants.agents.push({
        configurationId: configuration.sId,
        name: configuration.name,
        pictureUrl: configuration.pictureUrl,
      });
    }
  }

  return participants;
}
