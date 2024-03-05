import { Avatar, Button, DropdownMenu } from "@dust-tt/sparkle";
import { ReactionIcon } from "@dust-tt/sparkle";
import type { UserType, WorkspaceType } from "@dust-tt/types";
import type { MessageReactionType } from "@dust-tt/types";
import type { Emoji, EmojiMartData } from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import type { ComponentType, MouseEventHandler } from "react";
import { useEffect, useRef, useState } from "react";
import React from "react";
import { useSWRConfig } from "swr";

import { useSubmitFunction } from "@app/lib/client/utils";
import { classNames } from "@app/lib/utils";

const MAX_MORE_REACTIONS_TO_SHOW = 9;

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
      <DropdownMenu.Items width={400} origin="topRight" overflow="visible">
        <Picker
          theme="light"
          previewPosition="none"
          data={emojiData}
          onEmojiSelect={async (emojiData: Emoji) => {
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

/**
 * Parent component for both UserMessage and AgentMessage, to ensure avatar,
 * side buttons and spacing are consistent between the two
 */

ConversationMessage.defaultProps = {
  avatarBusy: false,
  enableEmojis: true,
};

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
  avatarBusy,
  enableEmojis,
  renderName,
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
  enableEmojis: boolean;
  renderName: (name: string | null) => React.ReactNode;
}) {
  const { mutate } = useSWRConfig();

  const [emojiData, setEmojiData] = useState<EmojiMartData | null>(null);

  useEffect(() => {
    async function loadEmojiData() {
      const mod = await import("@emoji-mart/data");
      const data: EmojiMartData = mod.default as EmojiMartData;
      setEmojiData(data);
    }

    void loadEmojiData();
  }, []);

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
      <div className="flex w-full flex-col gap-2 px-4 sm:flex-row sm:gap-4">
        {/* COLUMN 1: AVATAR*/}
        <div className="order-1 hidden xl:block">
          <Avatar
            visual={pictureUrl}
            name={name || undefined}
            size="md"
            busy={avatarBusy}
          />
        </div>
        <div className="hidden sm:block xl:hidden">
          <Avatar
            visual={pictureUrl}
            name={name || undefined}
            size="sm"
            busy={avatarBusy}
            className=""
          />
        </div>

        {/* COLUMN 2: CONTENT
         * min-w-0 prevents the content from overflowing the container
         */}
        <div className="order-3 flex min-w-0 flex-grow flex-col gap-4 sm:order-2">
          <div className="flex gap-3">
            <div className="sm:hidden">
              <Avatar
                visual={pictureUrl}
                name={name || undefined}
                size="xs"
                busy={avatarBusy}
                className=""
              />
            </div>
            {renderName(name)}
          </div>
          <div className="min-w-0 break-words pl-8 text-base font-normal sm:p-0">
            {children}
          </div>
        </div>

        {/* COLUMN 3: BUTTONS */}
        <div className="order-2 flex w-full shrink-0 flex-row-reverse flex-wrap gap-2 self-end sm:order-3 sm:w-24 sm:flex-row sm:justify-end sm:gap-1.5 sm:self-start">
          {/* COPY / RETRY */}
          {buttons && (
            <>
              {buttons.map((button, i) => (
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
              ))}
            </>
          )}

          {/* EMOJIS */}

          {enableEmojis && (
            <>
              <EmojiSelector
                user={user}
                reactions={reactions}
                handleEmoji={handleEmoji}
                emojiData={emojiData}
                disabled={isSubmittingEmoji}
              />
              {slicedReactions.map((reaction) => {
                const hasReacted = reaction.users.some(
                  (u) => u.userId === user.id
                );
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
          )}
        </div>
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
