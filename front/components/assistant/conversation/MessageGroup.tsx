import type { MessageTypeWithContent } from "@dust-tt/types";
import React, { useEffect, useRef } from "react";

import type { MessageWithContentFragmentsType } from "@app/components/assistant/conversation/ConversationViewer";

interface MessageGroupProps {
  messageType: MessageTypeWithContent;
  messages: MessageWithContentFragmentsType[][];
  isLastMessage: boolean;
  children: React.ReactNode;
}

export default function MessageGroup({
  messages,
  isLastMessage,
  children,
}: MessageGroupProps) {
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const screenHeight = window.innerHeight - 450;
  let shouldMaximize = false;
  if (!messages || !messages[0]) {
    shouldMaximize = true;
  } else {
    const isGenerating = messages[0][0].status == "created";
    const isLastMessageAgentMessage = messages[0][0].type === "agent_message";
    shouldMaximize = isLastMessage && isLastMessageAgentMessage && isGenerating;
  }

  const dynamicMinHeight = shouldMaximize ? `${screenHeight}px` : "0px";

  useEffect(() => {
    if (isLastMessage && lastMessageRef.current) {
      lastMessageRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [isLastMessage]);

  return (
    <div
      ref={isLastMessage ? lastMessageRef : undefined}
      style={{ minHeight: dynamicMinHeight }}
    >
      {children}
    </div>
  );
}
