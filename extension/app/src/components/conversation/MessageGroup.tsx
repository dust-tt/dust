import type {
  ConversationMessageReactionsType,
  LightWorkspaceType,
} from "@dust-tt/client";
import MessageItem from "@extension/components/conversation/MessageItem";
import type { MessageWithContentFragmentsType } from "@extension/lib/conversation";
import type { StoredUser } from "@extension/lib/storage";
import React, { useEffect, useRef } from "react";

interface MessageGroupProps {
  messages: MessageWithContentFragmentsType[];
  isLastMessageGroup: boolean;
  conversationId: string;
  hideReactions: boolean;
  isInModal: boolean;
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
  isLastMessageGroup,
  conversationId,
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

  return (
    <div
      id={isLastMessageGroup ? LAST_MESSAGE_GROUP_ID : ""}
      ref={isLastMessageGroup ? lastMessageGroupRef : undefined}
      style={{ minHeight }}
    >
      {messages.map((message) => (
        <MessageItem
          key={`message-${message.sId}`}
          conversationId={conversationId}
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
