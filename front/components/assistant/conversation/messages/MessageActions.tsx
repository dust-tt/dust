import type { EmojiMartData } from "@dust-tt/sparkle";
import {
  Button,
  DataEmojiMart,
  EmojiPicker,
  Popover,
  ReactionIcon,
} from "@dust-tt/sparkle";
import type { MessageReactionType, UserType } from "@dust-tt/types";
import type { ComponentType, MouseEventHandler } from "react";
import { useRef } from "react";

import { useSubmitFunction } from "@app/lib/client/utils";
import { classNames } from "@app/lib/utils";

type MessageActionsProps = {
  buttons?: {
    label: string;
    icon: ComponentType;
    onClick: MouseEventHandler<HTMLButtonElement>;
    disabled?: boolean;
  }[];
  messageEmoji?: MessageEmojiSelectorProps;
};

export function MessageActions({
  buttons = [],
  messageEmoji,
}: MessageActionsProps) {
  const buttonNodes = buttons?.map((button, i) => (
    <Button
      key={`message-button-${i}`}
      variant="tertiary"
      size="xs"
      label={button.label}
      labelVisible={false}
      icon={button.icon}
      onClick={button.onClick}
      disabled={button.disabled || false}
    />
  ));

  if (messageEmoji) {
    buttonNodes.push(
      <MessageEmojiSelector
        reactions={messageEmoji.reactions}
        user={messageEmoji.user}
        onSubmitEmoji={messageEmoji.onSubmitEmoji}
      />
    );
  }

  if (buttonNodes.length === 0) {
    return false;
  }

  return <div className="flex justify-end gap-2">{buttonNodes}</div>;
}

const MAX_MORE_REACTIONS_TO_SHOW = 9;

export interface MessageEmojiSelectorProps {
  reactions: MessageReactionType[];
  user: UserType;
  onSubmitEmoji: (p: { emoji: string; isToRemove: boolean }) => Promise<void>;
}

function MessageEmojiSelector({
  reactions,
  user,
  onSubmitEmoji,
}: MessageEmojiSelectorProps) {
  // TODO(2024-05-27 flav) Use mutate from `useConversationReactions` instead.

  const emojiData = DataEmojiMart as EmojiMartData;

  const { submit: handleEmoji, isSubmitting: isSubmittingEmoji } =
    useSubmitFunction(onSubmitEmoji);

  let slicedReactions = [...reactions];
  let hasMoreReactions = null;
  if (slicedReactions.length > MAX_MORE_REACTIONS_TO_SHOW) {
    hasMoreReactions = slicedReactions.length - MAX_MORE_REACTIONS_TO_SHOW;
    slicedReactions = slicedReactions.slice(0, MAX_MORE_REACTIONS_TO_SHOW);
  }

  return (
    <>
      <EmojiSelector
        user={user}
        reactions={reactions}
        handleEmoji={handleEmoji}
        emojiData={emojiData}
        disabled={isSubmittingEmoji}
      />
      {slicedReactions.map((reaction) => {
        const hasReacted = reaction.users.some((u) => u.userId === user.id);
        const emoji = emojiData?.emojis[reaction.emoji];
        const nativeEmoji = emoji?.skins[0].native;
        if (!nativeEmoji) {
          return null;
        }
        return (
          <ButtonEmoji
            key={reaction.emoji}
            variant={hasReacted ? "selected" : "unselected"}
            emoji={nativeEmoji}
            count={reaction.users.length.toString()}
            onClick={async () =>
              handleEmoji({
                emoji: reaction.emoji,
                isToRemove: hasReacted,
              })
            }
          />
        );
      })}
      {hasMoreReactions && (
        <div className="px-2 pt-1.5 text-xs font-medium">
          +{hasMoreReactions}
        </div>
      )}
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

function EmojiSelector({
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
    <Popover
      fullWidth
      popoverTriggerAsChild
      trigger={
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
      }
      content={
        <EmojiPicker
          theme="light"
          previewPosition="none"
          data={emojiData ?? undefined}
          onEmojiSelect={(emojiData) => {
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
      }
    />
  );
}
