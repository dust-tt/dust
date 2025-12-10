import type { FetchConversationParticipantsResponse } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/participants";
import type { AgentMessageNewEvent, UserMessageNewEvent } from "@app/types";
import { isAgentMessageType, isUserMessageType } from "@app/types";

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
