import { UserMessageType } from "@app/types/assistant/conversation";
import React from "react";
import { ConversationMessage } from "@app/components/assistant/conversation/ConversationMessage";

export function UserMessage({ message }: { message: UserMessageType }) {
  return (
    <ConversationMessage avatarVisual={message.user?.image}>
      <div className="text-sm font-medium">{message.context.fullName}</div>
      <div className="text-base font-normal">{message.content}</div>
    </ConversationMessage>
  );
}
