import React from "react";

import { Button } from "@sparkle/components";
import { ConversationMessageContent } from "@sparkle/components/ConversationMessageContent";
import { ConversationMessageHeader } from "@sparkle/components/ConversationMessageHeader";
import { cn } from "@sparkle/lib/utils";

export type ConversationMessageSizeType = "compact" | "normal";

type MessageType = "agent" | "user";

const messageSizeClasses: Record<ConversationMessageSizeType, string> = {
  compact: "s-p-3",
  normal: "s-p-4",
};

const messageTypeClasses: Record<MessageType, string> = {
  user: "s-bg-structure-50",
  agent: "",
};

type ConversationMessageProps = {
  avatarBusy?: boolean;
  buttons?: React.ReactElement<typeof Button>[];
  children?: React.ReactNode;
  citations?: React.ReactElement[];
  name: string | null;
  pictureUrl?: string | React.ReactNode | null;
  renderName?: (name: string | null) => React.ReactNode;
  size?: ConversationMessageSizeType;
  type: MessageType;
};

/**
 * Parent component for both UserMessage and AgentMessage, to ensure avatar,
 * side buttons and spacing are consistent between the two
 */
export function ConversationMessage({
  avatarBusy = false,
  buttons,
  children,
  citations,
  name,
  pictureUrl,
  renderName = (name) => (
    <div className="s-text-base s-font-medium">{name}</div>
  ),
  size = "normal",
  type,
}: ConversationMessageProps) {
  return (
    <div
      className={cn(
        "s-mt-2 s-flex s-w-full s-flex-col s-justify-stretch s-gap-4 s-rounded-3xl",
        messageTypeClasses[type],
        messageSizeClasses[size]
      )}
    >
      <ConversationMessageHeader
        avatarUrl={pictureUrl}
        name={name ?? undefined}
        size={size}
        isBusy={avatarBusy}
        renderName={renderName}
      />

      <ConversationMessageContent citations={citations} size={size}>
        {children}
      </ConversationMessageContent>

      <div className="s-flex s-justify-end s-gap-2">{buttons}</div>
    </div>
  );
}
