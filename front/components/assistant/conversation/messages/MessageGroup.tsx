import React, { useEffect, useRef } from "react";

import type { MessageWithContentFragmentsType } from "@app/components/assistant/conversation/ConversationViewer";

interface MessageGroupProps {
  messages: MessageWithContentFragmentsType[][];
  isLastMessage: boolean;
  children?: React.ReactNode;
}

const OFFSET_FROM_WINDOW = 450;

export default function MessageGroup({
  messages,
  isLastMessage,
  children,
}: MessageGroupProps) {
  const lastMessageRef = useRef<HTMLDivElement>(null);

  const shouldMaximize = React.useMemo(() => {
    if (!messages || !messages[0] || !messages[0][0]) {
      return true;
    }
    const firstMessage = messages[0][0];

    if (firstMessage.type === "user_message") {
      return false;
    }

    const isGenerating = firstMessage.status === "created";
    const isLastMessageAgentMessage = firstMessage.type === "agent_message";

    return isLastMessage && isLastMessageAgentMessage && isGenerating;
  }, [messages, isLastMessage]);

  const dynamicMinHeight = shouldMaximize
    ? `${window.innerHeight - OFFSET_FROM_WINDOW}px`
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
      style={{ minHeight: dynamicMinHeight }}
    >
      {children}
    </div>
  );
}
