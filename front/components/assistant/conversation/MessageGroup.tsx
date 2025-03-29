import React, { useEffect, useRef } from "react";

import MessageItem from "@app/components/assistant/conversation/MessageItem";
import type { AgentMessageFeedbackType } from "@app/lib/api/assistant/feedback";
import type {
  ConversationType,
  FetchConversationMessagesResponse,
  MessageWithContentFragmentsType,
  UserType,
  WorkspaceType,
} from "@app/types";

interface MessageGroupProps {
  messages: MessageWithContentFragmentsType[];
  isLastMessageGroup: boolean;
  conversation: ConversationType;
  feedbacks: AgentMessageFeedbackType[];
  isInModal: boolean;
  owner: WorkspaceType;
  prevFirstMessageId: string | null;
  prevFirstMessageRef: React.RefObject<HTMLDivElement>;
  user: UserType;
  latestPage?: FetchConversationMessagesResponse;
}

// arbitrary offset to scroll the last MessageGroup to
const VIEWPORT_OFFSET_RATIO = 0.5;
const MAX_OFFSET_PIXEL = 600;

export const LAST_MESSAGE_GROUP_ID = "last-message-group";

export default function MessageGroup({
  messages,
  isLastMessageGroup,
  conversation,
  feedbacks,
  isInModal,
  owner,
  prevFirstMessageId,
  prevFirstMessageRef,
  user,
  latestPage,
}: MessageGroupProps) {
  const lastMessageGroupRef = useRef<HTMLDivElement>(null);

  const offset = Math.min(
    window.innerHeight * VIEWPORT_OFFSET_RATIO,
    MAX_OFFSET_PIXEL
  );
  const minHeight = isLastMessageGroup ? `${offset}px` : "0px";

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
      className="flex flex-col items-end gap-6"
    >
      {messages.map((message) => (
        <MessageItem
          key={`message-${message.sId}`}
          conversation={conversation}
          messageFeedback={feedbacks.find(
            (feedback) => feedback.messageId === message.sId
          )}
          isInModal={isInModal}
          message={message}
          owner={owner}
          ref={
            message.sId === prevFirstMessageId ? prevFirstMessageRef : undefined
          }
          user={user}
          isLastMessage={latestPage?.messages.at(-1)?.sId === message.sId}
        />
      ))}
    </div>
  );
}
