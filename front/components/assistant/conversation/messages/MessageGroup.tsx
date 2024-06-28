import { isAgentMessageType, isUserMessageType } from "@dust-tt/types";
import React, { useEffect, useMemo, useRef } from "react";

import type { MessageWithContentFragmentsType } from "@app/components/assistant/conversation/ConversationViewer";

interface MessageGroupProps {
  messages: MessageWithContentFragmentsType[][];
  isLastMessage: boolean;
  children?: React.ReactNode;
}

// arbitrary offset to scroll the last MessageGroup to
const VIEWPORT_OFFSET = 450;

export const LAST_MESSAGE_GROUP_CLASS = "last-message-group";

export default function MessageGroup({
  messages,
  isLastMessage,
  children,
}: MessageGroupProps) {
  const lastMessageRef = useRef<HTMLDivElement>(null);

  const shouldExpandHeight = useMemo(() => {
    if (messages.length === 0) {
      return false;
    }
    const initialMessageGroup = messages[0];
    if (initialMessageGroup.length === 0) {
      return false;
    }

    const initialMessage = messages[0][0];
    if (isUserMessageType(initialMessage)) {
      return false;
    }

    const isMessageGenerating = initialMessage.status === "created";
    const isAgentMessage = isAgentMessageType(initialMessage);

    return isLastMessage && isAgentMessage && isMessageGenerating;
  }, [messages, isLastMessage]);

  const minHeight = shouldExpandHeight
    ? `${window.innerHeight - VIEWPORT_OFFSET}px`
    : "0px";

  useEffect(() => {
    if (isLastMessage && lastMessageRef.current) {
      lastMessageRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [isLastMessage]);

  return (
    <div
      className={isLastMessage ? LAST_MESSAGE_GROUP_CLASS : ""}
      ref={isLastMessage ? lastMessageRef : undefined}
      style={{ minHeight }}
    >
      {children}
    </div>
  );
}
