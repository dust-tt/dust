import React from "react";

import { ConversationMessage } from "@app/components/assistant/conversation/ConversationMessage";
import { AgentMessageType } from "@app/types/assistant/conversation";

export function AgentMessage({ message }: { message: AgentMessageType }) {
  // TODO what are the semantics of message.visibility? should we make this
  // check here?
  if (message.visibility === "deleted") {
    return null;
  }
  return (
    <ConversationMessage
      pictureUrl={message.configuration.pictureUrl}
      name={message.configuration.name}
    >
      <div className="text-base font-normal">{message.content}</div>
    </ConversationMessage>
  );
}
