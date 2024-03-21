import type {
  ConversationMessageReactions,
  ConversationType,
  MessageWithRankType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import React from "react";

import { AgentMessage } from "@app/components/assistant/conversation/AgentMessage";
import { ContentFragment } from "@app/components/assistant/conversation/ContentFragment";
import { UserMessage } from "@app/components/assistant/conversation/UserMessage";

interface MessageItemProps {
  conversation: ConversationType;
  hideReactions: boolean;
  isInModal: boolean;
  message: MessageWithRankType;
  owner: WorkspaceType;
  reactions: ConversationMessageReactions;
  user: UserType;
}

const MessageItem = React.forwardRef<HTMLDivElement, MessageItemProps>(
  function MessageItem(
    {
      conversation,
      hideReactions,
      isInModal,
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
                message={message}
                conversation={conversation}
                owner={owner}
                user={user}
                reactions={messageReactions}
                hideReactions={hideReactions}
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
                conversationId={conversation.sId}
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
