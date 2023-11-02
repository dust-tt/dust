import { Avatar, Button, DropdownMenu } from "@dust-tt/sparkle";
import { ReactionIcon } from "@dust-tt/sparkle";
import { Emoji, EmojiMartData } from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import {
  ComponentType,
  MouseEventHandler,
  useEffect,
  useRef,
  useState,
} from "react";
import React from "react";
import { mutate } from "swr";

import { useSubmitFunction } from "@app/lib/client/utils";
import { classNames } from "@app/lib/utils";
import { MessageReactionType } from "@app/types/assistant/conversation";
import { UserType, WorkspaceType } from "@app/types/user";

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
            label=" "
            type="menu"
            disabled={disabled}
          />
        </div>
      </DropdownMenu.Button>
      <DropdownMenu.Items width={280} origin="topRight">
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
            await handleEmoji({
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
  // avatarBackgroundColor,
  enableEmojis = true,
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
  avatarBackgroundColor?: string;
  enableEmojis: boolean;
}) {
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
      {/* SMALL SIZE SCREEN*/}
      <div className="flex w-full gap-4 xl:hidden">
        <div className="flex w-full flex-grow flex-col gap-4">
          <div className="flex items-start gap-2">
            <div className="flex h-8 flex-grow items-center gap-2">
              <Avatar
                visual={pictureUrl}
                name={name || undefined}
                size="xs"
                busy={avatarBusy}
                // backgroundColor={avatarBackgroundColor}
              />
              <div className="flex-grow text-sm font-medium">{name}</div>
            </div>
            <div className="flex flex-col items-end gap-2">
              {/* COPY / RETRY */}
              <div className="flex gap-1">
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
                      />
                    ))}
                  </>
                )}
                {/* EMOJIS */}
                {enableEmojis && (
                  <EmojiSelector
                    user={user}
                    reactions={reactions}
                    handleEmoji={handleEmoji}
                    emojiData={emojiData}
                    disabled={isSubmittingEmoji}
                  />
                )}
              </div>
              {enableEmojis && (
                <div className="flex flex-wrap gap-3">
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
                          await handleEmoji({
                            emoji: reaction.emoji,
                            isToRemove: hasReacted,
                          })
                        }
                      />
                    );
                  })}
                  {hasMoreReactions && (
                    <div className="px-2 pt-2 text-xs">+{hasMoreReactions}</div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="min-w-0 break-words pl-8 text-base font-normal">
            {children}
          </div>
        </div>
      </div>

      {/* BIG SIZE SCREEN*/}
      <div className="flex hidden w-full gap-4 xl:flex">
        {/* COLUMN 1: AVATAR - in small size if small layout */}
        <Avatar
          visual={pictureUrl}
          name={name || undefined}
          size="md"
          busy={avatarBusy}
        />

        {/* COLUMN 2: CONTENT
         * min-w-0 prevents the content from overflowing the container
         */}
        <div className="flex min-w-0 flex-grow flex-col gap-4">
          <div className="text-sm font-medium">{name}</div>
          <div className="min-w-0 break-words text-base font-normal">
            {children}
          </div>
        </div>

        {/* COLUMN 3: BUTTONS */}
        <div className="w-16 overflow-visible">
          <div className="w-32">
            {/* COPY / RETRY */}
            {buttons && (
              <div className="mb-4 flex flex-wrap gap-1">
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
              </div>
            )}

            {/* EMOJIS */}

            {enableEmojis && (
              <>
                <div className="mb-4">
                  <EmojiSelector
                    user={user}
                    reactions={reactions}
                    handleEmoji={handleEmoji}
                    emojiData={emojiData}
                  />
                </div>
                <div className="ml-2 flex flex-wrap gap-3">
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
                          await handleEmoji({
                            emoji: reaction.emoji,
                            isToRemove: hasReacted,
                          })
                        }
                      />
                    );
                  })}
                  {hasMoreReactions && (
                    <div className="px-2 pt-2 text-xs">+{hasMoreReactions}</div>
                  )}
                </div>
              </>
            )}
          </div>
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
        "flex cursor-pointer items-center gap-1.5 py-1 text-base font-medium transition-all duration-300 hover:text-action-400 active:text-action-600"
      )}
      onClick={onClick}
    >
      {emoji}
      {count && <span className="text-xs">{count}</span>}
    </div>
  );
}
