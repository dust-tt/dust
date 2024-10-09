import type { EmojiMartData } from "@dust-tt/sparkle";
import { DataEmojiMart } from "@dust-tt/sparkle";
import { Button, EmojiPicker, Popover, ReactionIcon } from "@dust-tt/sparkle";
import type {
  MessageReactionType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import type { ComponentType, MouseEventHandler } from "react";
import { useRef } from "react";
import { useSWRConfig } from "swr";

import { useSubmitFunction } from "@app/lib/client/utils";
import { classNames } from "@app/lib/utils";

type MessageActionsProps = {
  buttons?: {
    label: string;
    icon: ComponentType;
    onClick: MouseEventHandler<HTMLButtonElement>;
    disabled?: boolean;
  }[];
  enableEmojis: boolean;
  messageId: string;
} & MessageEmojiSelectorProps;

export function MessageActions({
  buttons,
  conversationId,
  enableEmojis,
  messageId,
  owner,
  reactions,
  user,
}: MessageActionsProps) {
  if (!buttons) {
    return <></>;
  }

  const buttonNodes = buttons?.map((button, i) => (
    <Button
      key={`message-${messageId}-button-${i}`}
      variant="tertiary"
      size="xs"
      label={button.label}
      labelVisible={false}
      icon={button.icon}
      onClick={button.onClick}
      disabled={button.disabled || false}
    />
  ));

  if (enableEmojis) {
    buttonNodes.push(
      <MessageEmojiSelector
        key={`message-${messageId}-emoji-selector`}
        conversationId={conversationId}
        messageId={messageId}
        owner={owner}
        reactions={reactions}
        user={user}
      />
    );
  }

  return <div className="flex justify-end gap-2">{buttonNodes}</div>;
}

const MAX_MORE_REACTIONS_TO_SHOW = 9;

interface MessageEmojiSelectorProps {
  conversationId: string;
  messageId: string;
  owner: WorkspaceType;
  reactions: MessageReactionType[];
  user: UserType;
}

function MessageEmojiSelector({
  conversationId,
  messageId,
  owner,
  reactions,
  user,
}: MessageEmojiSelectorProps) {
  // TODO(2024-05-27 flav) Use mutate from `useConversationReactions` instead.
  const { mutate } = useSWRConfig();

  const emojiData = DataEmojiMart as EmojiMartData;

  const { submit: handleEmoji, isSubmitting: isSubmittingEmoji } =
    useSubmitFunction(
      async ({ emoji, isToRemove }: { emoji: string; isToRemove: boolean }) => {
        const res = await fetch(
          `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${messageId}/reactions`,
          {
            method: isToRemove ? "DELETE" : "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              reaction: emoji,
            }),
          }
        );
        if (res.ok) {
          await mutate(
            `/api/w/${owner.sId}/assistant/conversations/${conversationId}/reactions`
          );
        }
      }
    );

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
