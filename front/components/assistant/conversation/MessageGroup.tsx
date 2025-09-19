import React, { useEffect, useRef } from "react";

import MessageItem from "@app/components/assistant/conversation/MessageItem";
import type { AgentMessageFeedbackType } from "@app/lib/api/assistant/feedback";
import type {
  FetchConversationMessagesResponse,
  MessageWithContentFragmentsType,
  UserType,
  WorkspaceType,
} from "@app/types";

interface MessageGroupProps {
  messages: MessageWithContentFragmentsType[];
  isLastMessageGroup: boolean;
  conversationId: string;
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
  conversationId,
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

  const filteredMessages = messages.filter(
    (message) =>
      message.type !== "user_message" ||
      message.context.origin !== "agxxent_handover"
  );

  return (
    <div
      id={isLastMessageGroup ? LAST_MESSAGE_GROUP_ID : ""}
      ref={isLastMessageGroup ? lastMessageGroupRef : undefined}
      style={{ minHeight }}
    >
      {filteredMessages.map((message, index) => (
        <MessageItem
          key={`message-${message.sId}`}
          index={index}
          conversationId={conversationId}
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
