import { Avatar } from "@dust-tt/sparkle";
import React from "react";

import { ConversationMessage } from "@app/components/assistant/conversation/ConversationMessage";
import { UserMessageType } from "@app/types/assistant/conversation";

export function UserMessage({ message }: { message: UserMessageType }) {
  return (
    <ConversationMessage
      avatar={<Avatar visual={message.user?.image} size="sm" />}
      name={message.context.fullName}
    >
      <div className="text-base font-normal">{message.content}</div>
    </ConversationMessage>
  );
}
