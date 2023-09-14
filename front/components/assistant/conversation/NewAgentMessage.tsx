import React from "react";

import { ConversationMessage } from "@app/components/assistant/conversation/ConversationMessage";
import { AgentMessageType } from "@app/types/assistant/conversation";

export function AgentMessage({ message }: { message: AgentMessageType }) {
  return (
    <ConversationMessage
      pictureUrl={message.configuration.pictureUrl}
      name={message.configuration.name}
    >
      <div className="text-base font-normal">{message.content}</div>
    </ConversationMessage>
  );
}
