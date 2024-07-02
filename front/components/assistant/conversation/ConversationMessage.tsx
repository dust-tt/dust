import type {
  ContentFragmentType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import type { MessageReactionType } from "@dust-tt/types";
import type { ComponentType, MouseEventHandler } from "react";
import React from "react";

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

/**
 * Parent component for both UserMessage and AgentMessage, to ensure avatar,
 * side buttons and spacing are consistent between the two
 */
export function ConversationMessage({
  owner,
  user,
  conversationId,
  messageId,
  children,
  name,
  pictureUrl,
  buttons,
  reactions,
  avatarBusy = false,
  enableEmojis = true,
  renderName,
  type,
  size = "normal",
  citations,
}: {
  owner: WorkspaceType;
  user: UserType;
  conversationId: string;
  messageId: string;
  children?: React.ReactNode;
  name: string | null;
  pictureUrl?: string | React.ReactNode | null;
  buttons?: {
    label: string;
    icon: ComponentType;
    onClick: MouseEventHandler<HTMLButtonElement>;
    disabled?: boolean;
  }[];
  reactions: MessageReactionType[];
  avatarBusy?: boolean;
  enableEmojis?: boolean;
  renderName: (name: string | null) => React.ReactNode;
  type: MessageType;
  size?: MessageSizeType;
  // TODO(2024-05-27 flav) Change type to support AgentMessage citations.
  citations?: ContentFragmentType[];
}) {
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

      <MessageActions
        buttons={buttons}
        messageId={messageId}
        enableEmojis={enableEmojis}
        conversationId={conversationId}
        owner={owner}
        reactions={reactions}
        user={user}
      />
    </div>
  );
}
