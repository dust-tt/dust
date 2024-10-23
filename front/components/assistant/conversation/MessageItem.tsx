import type {
  ConversationMessageReactions,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import React from "react";
import { useSWRConfig } from "swr";

import { AgentMessage } from "@app/components/assistant/conversation/AgentMessage";
import type { MessageWithContentFragmentsType } from "@app/components/assistant/conversation/ConversationViewer";
import { UserMessage } from "@app/components/assistant/conversation/UserMessage";

interface MessageItemProps {
  conversationId: string;
  hideReactions: boolean;
  isInModal: boolean;
  isLastMessage: boolean;
  message: MessageWithContentFragmentsType;
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
    const { mutate } = useSWRConfig();

    if (message.visibility === "deleted") {
      return null;
    }

    const messageEmoji = hideReactions
      ? undefined
      : {
          reactions: messageReactions,
          user,
          onSubmitEmoji: async ({
            emoji,
            isToRemove,
          }: {
            emoji: string;
            isToRemove: boolean;
          }) => {
            const res = await fetch(
              `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${message.sId}/reactions`,
              {
                method: isToRemove ? "DELETE" : "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  reaction: emoji,
                }),
              }
            );
            if (res.ok) {
              await mutate(
                `/api/w/${owner.sId}/assistant/conversations/${conversationId}/reactions`
              );
            }
          },
        };

    switch (type) {
      case "user_message":
        return (
          <div key={`message-id-${sId}`} ref={ref}>
            <UserMessage
              contentFragments={message.contenFragments}
              conversationId={conversationId}
              isLastMessage={isLastMessage}
              message={message}
              owner={owner}
              size={isInModal ? "compact" : "normal"}
            />
          </div>
        );

      case "agent_message":
        return (
          <div key={`message-id-${sId}`} ref={ref}>
            <AgentMessage
              conversationId={conversationId}
              isInModal={isInModal}
              isLastMessage={isLastMessage}
              message={message}
              messageEmoji={messageEmoji}
              owner={owner}
              size={isInModal ? "compact" : "normal"}
            />
          </div>
        );

      default:
        console.error("Unknown message type", message);
    }
  }
);

export default MessageItem;
