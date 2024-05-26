import { Button, DropdownMenu, EmojiPicker } from "@dust-tt/sparkle";
import { ReactionIcon } from "@dust-tt/sparkle";
import type {
  ContentFragmentType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import type { MessageReactionType } from "@dust-tt/types";
// TODO(2024-04-24 flav) Remove emoji-mart dependency from front.
import type { Emoji, EmojiMartData } from "@emoji-mart/data";
import type { ComponentType, MouseEventHandler } from "react";
import { useRef } from "react";
import React from "react";

import { ContentFragment } from "@app/components/assistant/conversation/ContentFragment";
import { MessageActions } from "@app/components/assistant/conversation/messages/MessageActions";
import { MessageHeader } from "@app/components/assistant/conversation/messages/MessageHeader";
import { classNames } from "@app/lib/utils";

export function EmojiSelector({
  user,
  reactions,
  handleEmoji,
  emojiData,
  disabled = false,
}: {
  user: UserType;
  reactions: MessageReactionType[];
  handleEmoji: ({
    emoji,
    isToRemove,
  }: {
    emoji: string;
    isToRemove: boolean;
  }) => void;
  emojiData: EmojiMartData | null;
  disabled?: boolean;
}) {
  const buttonRef = useRef<HTMLDivElement>(null);

  return (
    <DropdownMenu>
      <DropdownMenu.Button>
        <div ref={buttonRef}>
          <Button
            variant="tertiary"
            size="xs"
            icon={ReactionIcon}
            labelVisible={false}
            label="Reaction picker"
            disabledTooltip
            type="menu"
            disabled={disabled}
          />
        </div>
      </DropdownMenu.Button>
      <DropdownMenu.Items
        width={350}
        origin="topRight"
        overflow="visible"
        variant="no-padding"
      >
        <EmojiPicker
          theme="light"
          previewPosition="none"
          data={emojiData ?? undefined}
          onEmojiSelect={(emojiData: Emoji) => {
            const reaction = reactions.find((r) => r.emoji === emojiData.id);
            const hasReacted =
              (reaction &&
                reaction.users.find((u) => u.userId === user.id) !==
                  undefined) ||
              false;
            handleEmoji({
              emoji: emojiData.id,
              isToRemove: hasReacted,
            });
            buttonRef.current?.click();
          }}
        />
      </DropdownMenu.Items>
    </DropdownMenu>
  );
}

type MessageType = "user" | "agent" | "fragment";

const messageSizeClasses = {
  compact: "p-3",
  normal: "p-4",
};

const messageTypeClasses = {
  user: "bg-structure-50",
  agent: "",
  fragment: "",
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
  size?: "normal" | "compact";
  citations: ContentFragmentType[];
}) {
  return (
    <>
      <div
        className={classNames(
          "flex w-full flex-col justify-stretch gap-4 rounded-2xl",
          messageTypeClasses[type],
          messageSizeClasses[size]
        )}
      >
        {/* COLUMN 2: CONTENT
         * min-w-0 prevents the content from overflowing the container
         */}
        <MessageHeader
          avatarUrl={pictureUrl}
          name={name ?? undefined}
          size={size}
          isBusy={avatarBusy}
          renderName={renderName}
        />
        <div className="min-w-0 break-words pl-8 text-base font-normal sm:p-0">
          {children}
        </div>
        {citations && (
          <div
            className={classNames(
              "s-grid s-gap-2",
              size === "compact" ? "s-grid-cols-2" : "s-grid-cols-4"
            )}
          >
            {citations.map((c) => {
              // TODO: key.
              return <ContentFragment message={c} key={c.id} />;
            })}
          </div>
        )}

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
    </>
  );
}
interface ButtonEmojiProps {
  variant?: "selected" | "unselected";
  count?: string;
  emoji?: string;
  onClick?: () => void;
}

export function ButtonEmoji({
  variant,
  emoji,
  count,
  onClick,
}: ButtonEmojiProps) {
  return (
    <div
      className={classNames(
        variant === "selected" ? "text-action-500" : "text-element-800",
        "flex cursor-pointer items-center gap-1.5 py-0.5 text-base font-medium transition-all duration-300 hover:text-action-400 active:text-action-600"
      )}
      onClick={onClick}
    >
      {emoji}
      {count && <span className="text-xs">{count}</span>}
    </div>
  );
}
