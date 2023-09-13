import { AgentMessageType } from "@app/types/assistant/conversation";
import React from "react";
import { ConversationMessage } from "@app/components/assistant/conversation/ConversationMessage";

export function AgentMessage({ message }: { message: AgentMessageType }) {
  return (
    <ConversationMessage avatarVisual={message.configuration.pictureUrl}>
      <div className="text-sm font-medium">{message.configuration.name}</div>
      <div className="text-base font-normal">{message.content}</div>
    </ConversationMessage>
  );
}
