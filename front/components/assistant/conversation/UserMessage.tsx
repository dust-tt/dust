import React from "react";

import { ConversationMessage } from "@app/components/assistant/conversation/ConversationMessage";
import { RenderMarkdown } from "@app/components/RenderMarkdown";
import { UserMessageType } from "@app/types/assistant/conversation";

export function UserMessage({ message }: { message: UserMessageType }) {
  return (
    <ConversationMessage
      pictureUrl={message.user?.image}
      name={message.context.fullName}
      messageId={message.sId}
    >
      <RenderMarkdown content={message.content} />
    </ConversationMessage>
  );
}
