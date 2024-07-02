import type {
  ConversationMessageReactions,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import { isAgentMessageType, isUserMessageType } from "@dust-tt/types";
import React, { useEffect, useMemo, useRef } from "react";

import type { MessageWithContentFragmentsType } from "@app/components/assistant/conversation/ConversationViewer";
import MessageItem from "@app/components/assistant/conversation/messages/MessageItem";
import type { FetchConversationMessagesResponse } from "@app/lib/api/assistant/messages";

interface MessageGroupProps {
  messages: MessageWithContentFragmentsType[][];
  isLastMessageGroup: boolean;
  conversationId: string;
  hideReactions: boolean;
  isInModal: boolean;
  owner: WorkspaceType;
  reactions: ConversationMessageReactions;
  prevFirstMessageId: string | null;
  prevFirstMessageRef: React.RefObject<HTMLDivElement>;
  user: UserType;
  latestPage?: FetchConversationMessagesResponse;
  latestMentions: string[];
}

// arbitrary offset to scroll the last MessageGroup to
const VIEWPORT_OFFSET = 450;

export const LAST_MESSAGE_GROUP_ID = "last-message-group";

export default function MessageGroup({
  messages,
  isLastMessageGroup,
  conversationId,
  hideReactions,
  isInModal,
  owner,
  reactions,
  prevFirstMessageId,
  prevFirstMessageRef,
  user,
  latestPage,
  latestMentions,
}: MessageGroupProps) {
  const lastMessageGroupRef = useRef<HTMLDivElement>(null);

  const shouldExpandHeight = useMemo(() => {
    if (messages.length === 0) {
      return false;
    }
    const initialMessageGroup = messages[0];
    if (initialMessageGroup.length === 0) {
      return false;
    }

    const initialMessage = initialMessageGroup[0];
    if (isUserMessageType(initialMessage)) {
      return false;
    }

    const isMessageGenerating = initialMessage.status === "created";
    const isAgentMessage = isAgentMessageType(initialMessage);

    return isLastMessageGroup && isAgentMessage && isMessageGenerating;
  }, [messages, isLastMessageGroup]);

  const minHeight = shouldExpandHeight
    ? `${window.innerHeight - VIEWPORT_OFFSET}px`
    : "0px";

  useEffect(() => {
    if (isLastMessageGroup && lastMessageGroupRef.current) {
      lastMessageGroupRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [isLastMessageGroup]);

  return (
    <div
      id={isLastMessageGroup ? LAST_MESSAGE_GROUP_ID : ""}
      ref={isLastMessageGroup ? lastMessageGroupRef : undefined}
      style={{ minHeight }}
    >
      {messages.map((group) => {
        return group.map((message) => {
          return (
            <MessageItem
              key={`message-${message.sId}`}
              conversationId={conversationId}
              hideReactions={hideReactions}
              isInModal={isInModal}
              message={message}
              owner={owner}
              reactions={reactions}
              ref={
                message.sId === prevFirstMessageId
                  ? prevFirstMessageRef
                  : undefined
              }
              user={user}
              isLastMessage={latestPage?.messages.at(-1)?.sId === message.sId}
              latestMentions={latestMentions}
            />
          );
        });
      })}
    </div>
  );
}
