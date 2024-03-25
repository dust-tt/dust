import type {
  ConversationMessageReactions,
  MessageType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import React from "react";

import { AgentMessage } from "@app/components/assistant/conversation/AgentMessage";
import { ContentFragment } from "@app/components/assistant/conversation/ContentFragment";
import { UserMessage } from "@app/components/assistant/conversation/UserMessage";

interface MessageItemProps {
  conversationId: string;
  hideReactions: boolean;
  isInModal: boolean;
  isLastMessage: boolean;
  latestMentions: string[];
  message: MessageType;
  owner: WorkspaceType;
  reactions: ConversationMessageReactions;
  user: UserType;
}

const MessageItem = React.forwardRef<HTMLDivElement, MessageItemProps>(
  function MessageItem(
    {
      conversationId,
      hideReactions,
      isInModal,
      isLastMessage,
      latestMentions,
      message,
      owner,
      reactions,
      user,
    }: MessageItemProps,
    ref
  ) {
    const { sId, type } = message;

    const convoReactions = reactions.find((r) => r.messageId === sId);
    const messageReactions = convoReactions?.reactions || [];

    if (message.visibility === "deleted") {
      return null;
    }

    switch (type) {
      case "user_message":
        return (
          <div
            key={`message-id-${sId}`}
            className="bg-structure-50 px-2 py-8"
            ref={ref}
          >
            <div className="mx-auto flex max-w-4xl flex-col gap-4">
              <UserMessage
                conversationId={conversationId}
                hideReactions={hideReactions}
                isLastMessage={isLastMessage}
                latestMentions={latestMentions}
                message={message}
                owner={owner}
                reactions={messageReactions}
                user={user}
              />
            </div>
          </div>
        );
      case "agent_message":
        return (
          <div key={`message-id-${sId}`} className="px-2 py-8" ref={ref}>
            <div className="mx-auto flex max-w-4xl gap-4">
              <AgentMessage
                message={message}
                owner={owner}
                user={user}
                conversationId={conversationId}
                reactions={messageReactions}
                isInModal={isInModal}
                hideReactions={hideReactions}
              />
            </div>
          </div>
        );
      case "content_fragment":
        return (
          <div
            key={`message-id-${sId}`}
            className="items-center bg-structure-50 px-2 pt-8"
            ref={ref}
          >
            <div className="mx-auto flex max-w-4xl flex-col gap-4">
              <ContentFragment message={message} />
            </div>
          </div>
        );
      default:
        console.error("Unknown message type", message);
    }
  }
);

export default MessageItem;
