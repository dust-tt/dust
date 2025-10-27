import cloneDeep from "lodash/cloneDeep";

import { getLightAgentMessageFromAgentMessage } from "@app/lib/api/assistant/citations";
import type { FetchConversationParticipantsResponse } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/participants";
import type {
  AgentMessageNewEvent,
  AgentMessageType,
  FetchConversationMessagesResponse,
  UserMessageNewEvent,
  UserMessageType,
} from "@app/types";
import { isAgentMessageType, isUserMessageType } from "@app/types";

/**
 * If no message pages exist, create a single page with the optimistic message.
 * If message pages exist, add the optimistic message to the first page, since
 * the message pages array is not yet reversed.
 */
export function updateMessagePagesWithOptimisticData(
  currentMessagePages: FetchConversationMessagesResponse[] | undefined,
  messageOrPlaceholder: AgentMessageType | UserMessageType
): FetchConversationMessagesResponse[] {
  const m = isAgentMessageType(messageOrPlaceholder)
    ? {
        ...getLightAgentMessageFromAgentMessage(messageOrPlaceholder),
        rank: messageOrPlaceholder.rank,
      }
    : messageOrPlaceholder;

  if (!currentMessagePages || currentMessagePages.length === 0) {
    return [
      {
        messages: [m],
        hasMore: false,
        lastValue: null,
      },
    ];
  }

  // We need to deep clone here, since SWR relies on the reference.
  const updatedMessages = cloneDeep(currentMessagePages);
  updatedMessages.at(0)?.messages.push(m);

  return updatedMessages;
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
        sId: user.sId,
        username: user.username,
        fullName: user.fullName,
        pictureUrl: user.image,
        action: "posted",
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
