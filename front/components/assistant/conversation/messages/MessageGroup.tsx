import React, { useEffect, useMemo, useRef } from "react";

import type { MessageWithContentFragmentsType } from "@app/components/assistant/conversation/ConversationViewer";

interface MessageGroupProps {
  messages: MessageWithContentFragmentsType[][];
  isLastMessage: boolean;
  children?: React.ReactNode;
}

const VIEWPORT_OFFSET = 450; // More generic term

export default function MessageGroup({
  messages,
  isLastMessage,
  children,
}: MessageGroupProps) {
  const lastMessageRef = useRef<HTMLDivElement>(null);

  const shouldExpandHeight = useMemo(() => {
    if (!messages || !messages[0] || !messages[0][0]) {
      return true;
    }
    const initialMessage = messages[0][0];

    if (initialMessage.type === "user_message") {
      return false;
    }

    const isMessageGenerating = initialMessage.status === "created";
    const isLastAgentMessage = initialMessage.type === "agent_message";

    return isLastMessage && isLastAgentMessage && isMessageGenerating;
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
      className={isLastMessage ? "last-message-group" : ""}
      ref={isLastMessage ? lastMessageRef : undefined}
      style={{ minHeight }}
    >
      {children}
    </div>
  );
}
