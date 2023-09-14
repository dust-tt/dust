import { Avatar } from "@dust-tt/sparkle";
import React from "react";

import { ConversationMessage } from "@app/components/assistant/conversation/ConversationMessage";
import { AgentMessageType } from "@app/types/assistant/conversation";

export function AgentMessage({ message }: { message: AgentMessageType }) {
  return (
    <ConversationMessage
      avatar={<Avatar visual={message.configuration.pictureUrl} size="sm" />}
      name={message.configuration.name}
    >
      <div className="text-base font-normal">{message.content}</div>
    </ConversationMessage>
  );
}
