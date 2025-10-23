import type { MessageWithContentFragmentsType } from "@app/shared/lib/conversation";
import type { AgentMessageFeedbackType } from "@app/shared/lib/feedbacks";
import type { StoredUser } from "@app/shared/services/auth";
import MessageItem from "@app/ui/components/conversation/MessageItem";
import type { AgentMessagePublicType, UserMessageType } from "@dust-tt/client";
import type {
  ConversationMessageReactionsType,
  LightWorkspaceType,
} from "@dust-tt/client";
import React, { useEffect, useRef } from "react";

interface MessageGroupProps {
  conversationId: string;
  feedbacks: AgentMessageFeedbackType[];
  hideReactions: boolean;
  isInModal: boolean;
  isLastMessageGroup: boolean;
  messages: MessageWithContentFragmentsType[];
  userAndAgentMessages: (UserMessageType | AgentMessagePublicType)[];
  owner: LightWorkspaceType;
  reactions: ConversationMessageReactionsType;
  user: StoredUser;
}

// arbitrary offset to scroll the last MessageGroup to
const VIEWPORT_OFFSET_RATIO = 0.5;
const MAX_OFFSET_PIXEL = 600;

export const LAST_MESSAGE_GROUP_ID = "last-message-group";

export default function MessageGroup({
  messages,
  userAndAgentMessages,
  isLastMessageGroup,
  conversationId,
  feedbacks,
  hideReactions,
  isInModal,
  owner,
  reactions,
  user,
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
      message.context.origin !== "agent_handover"
  );

  return (
    <div
      id={isLastMessageGroup ? LAST_MESSAGE_GROUP_ID : ""}
      ref={isLastMessageGroup ? lastMessageGroupRef : undefined}
      style={{ minHeight }}
    >
      {filteredMessages.map((message) => (
        <MessageItem
          key={`message-${message.sId}`}
          conversationId={conversationId}
          userAndAgentMessages={userAndAgentMessages}
          messageFeedback={feedbacks.find(
            (feedback) => feedback.messageId === message.sId
          )}
          hideReactions={hideReactions}
          isInModal={isInModal}
          message={message}
          owner={owner}
          reactions={reactions}
          user={user}
          isLastMessage={
            isLastMessageGroup && messages.at(-1)?.sId === message.sId
          }
        />
      ))}
    </div>
  );
}
