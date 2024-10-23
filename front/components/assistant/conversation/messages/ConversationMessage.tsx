import type { ContentFragmentType } from "@dust-tt/types";
import type { ComponentType, MouseEventHandler } from "react";
import React from "react";

import type { MessageEmojiSelectorProps } from "@app/components/assistant/conversation/messages/MessageActions";
import { MessageActions } from "@app/components/assistant/conversation/messages/MessageActions";
import { MessageContent } from "@app/components/assistant/conversation/messages/MessageContent";
import { MessageHeader } from "@app/components/assistant/conversation/messages/MessageHeader";
import { classNames } from "@app/lib/utils";

export type MessageSizeType = "compact" | "normal";

type MessageType = "agent" | "user";

const messageSizeClasses: Record<MessageSizeType, string> = {
  compact: "p-3",
  normal: "p-4",
};

const messageTypeClasses: Record<MessageType, string> = {
  user: "bg-structure-50",
  agent: "",
};

type ConversationMessageProps = {
  avatarBusy?: boolean;
  buttons?: {
    disabled?: boolean;
    icon: ComponentType;
    label: string;
    onClick: MouseEventHandler<HTMLButtonElement>;
  }[];
  children?: React.ReactNode;
  // TODO(2024-05-27 flav) Change type to support AgentMessage citations.
  citations?: ContentFragmentType[];
  messageEmoji?: MessageEmojiSelectorProps;
  name: string | null;
  pictureUrl?: string | React.ReactNode | null;
  renderName: (name: string | null) => React.ReactNode;
  size?: MessageSizeType;
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
  messageEmoji,
  name,
  pictureUrl,
  renderName,
  size = "normal",
  type,
}: ConversationMessageProps) {
  return (
    <div
      className={classNames(
        "mt-2 flex w-full flex-col justify-stretch gap-4 rounded-2xl",
        messageTypeClasses[type],
        messageSizeClasses[size]
      )}
    >
      <MessageHeader
        avatarUrl={pictureUrl}
        name={name ?? undefined}
        size={size}
        isBusy={avatarBusy}
        renderName={renderName}
      />

      <MessageContent citations={citations} size={size}>
        {children}
      </MessageContent>

      <MessageActions buttons={buttons} messageEmoji={messageEmoji} />
    </div>
  );
}
