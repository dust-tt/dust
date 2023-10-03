import {
  Avatar,
  Button,
  DropdownMenu,
  IconButton,
  PlusIcon,
} from "@dust-tt/sparkle";
import { Emoji, EmojiMartData } from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import { ComponentType, MouseEventHandler, useEffect, useState } from "react";
import React from "react";
import { mutate } from "swr";

import { classNames } from "@app/lib/utils";
import { MessageReactionType } from "@app/types/assistant/conversation";
import { UserType, WorkspaceType } from "@app/types/user";

const MAX_REACTIONS_TO_SHOW = 15;

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
}: {
  owner: WorkspaceType;
  user: UserType;
  conversationId: string;
  messageId: string;
  children?: React.ReactNode;
  name: string | null;
  pictureUrl?: string | null;
  buttons?: {
    label: string;
    icon: ComponentType;
    onClick: MouseEventHandler<HTMLButtonElement>;
  }[];
  reactions: MessageReactionType[];
  avatarBusy?: boolean;
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

  const handleEmoji = async ({
    emoji,
    isToRemove,
  }: {
    emoji: string;
    isToRemove: boolean;
  }) => {
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
  };

  const handleEmojiClick = async (emojiCode: string) => {
    const reaction = reactions.find((r) => r.emoji === emojiCode);
    const hasReacted =
      (reaction &&
        reaction.users.find((u) => u.userId === user.id) !== undefined) ||
      false;
    await handleEmoji({
      emoji: emojiCode,
      isToRemove: hasReacted,
    });
  };

  let hasMoreReactions = null;
  if (reactions.length > MAX_REACTIONS_TO_SHOW) {
    hasMoreReactions = reactions.length - MAX_REACTIONS_TO_SHOW;
    reactions = reactions.slice(0, MAX_REACTIONS_TO_SHOW);
  }

  return (
    <div className="flex w-full flex-row gap-4">
      <div className="flex-shrink-0">
        <Avatar
          visual={pictureUrl}
          name={name || undefined}
          size="md"
          busy={avatarBusy}
        />
      </div>
      <div className="min-w-0 flex-grow">
        <div className="flex flex-col gap-4">
          <div className="text-sm font-medium">{name}</div>
          <div className="min-w-0 break-words text-base font-normal">
            {children}
          </div>
          <div>
            {reactions.map((reaction) => {
              const hasReacted =
                reaction.users.find((u) => u.userId === user.id) !== undefined;
              const emoji = emojiData?.emojis[reaction.emoji];
              if (!emoji) {
                return null;
              }
              return (
                <React.Fragment key={reaction.emoji}>
                  <a
                    className="cursor-pointer"
                    onClick={async () => {
                      await handleEmoji({
                        emoji: reaction.emoji,
                        isToRemove: hasReacted,
                      });
                    }}
                  >
                    <Reacji
                      key={reaction.emoji}
                      count={reaction.users.length}
                      isHighlighted={hasReacted}
                      emoji={emoji}
                    ></Reacji>
                  </a>
                </React.Fragment>
              );
            })}
            {hasMoreReactions && (
              <span className="text-base text-xs">+{hasMoreReactions}</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex flex-col items-start gap-2 sm:flex-row">
          {buttons &&
            buttons.map((button, i) => (
              <div key={`message-${messageId}-button-${i}`}>
                <Button
                  variant="tertiary"
                  size="xs"
                  label={button.label}
                  labelVisible={false}
                  icon={button.icon}
                  onClick={button.onClick}
                />
              </div>
            ))}
        </div>

        <div className="duration-400 active:s-border-action-500 box-border inline-flex scale-100 cursor-pointer items-center gap-x-1 whitespace-nowrap rounded-full border border-structure-200 bg-structure-0 px-2 text-xs text-element-800 ">
          <a
            className="cursor-pointer px-1 py-1.5 hover:border-action-200 hover:bg-action-50 hover:drop-shadow-md active:scale-95 active:bg-action-100 active:drop-shadow-none"
            onClick={async () => await handleEmojiClick("+1")}
          >
            👍
          </a>
          <a
            className="cursor-pointer px-1 py-1.5 hover:border-action-200 hover:bg-action-50 hover:drop-shadow-md active:scale-95 active:bg-action-100 active:drop-shadow-none"
            onClick={async () => await handleEmojiClick("-1")}
          >
            👎
          </a>
          <a
            className="cursor-pointer px-1 py-1.5 hover:border-action-200 hover:bg-action-50 hover:drop-shadow-md active:scale-95 active:bg-action-100 active:drop-shadow-none"
            onClick={async () => await handleEmojiClick("heart")}
          >
            ❤️
          </a>
          <DropdownMenu>
            <DropdownMenu.Button>
              <IconButton variant="tertiary" size="xs" icon={PlusIcon} />
            </DropdownMenu.Button>
            <DropdownMenu.Items width={280}>
              <Picker
                theme="light"
                previewPosition="none"
                data={emojiData}
                onEmojiSelect={async (emojiData: Emoji) => {
                  const reaction = reactions.find(
                    (r) => r.emoji === emojiData.id
                  );
                  const hasReacted =
                    (reaction &&
                      reaction.users.find((u) => u.userId === user.id) !==
                        undefined) ||
                    false;
                  await handleEmoji({
                    emoji: emojiData.id,
                    isToRemove: hasReacted,
                  });
                }}
              />
            </DropdownMenu.Items>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

function Reacji({
  count,
  isHighlighted,
  emoji,
}: {
  count: number;
  isHighlighted: boolean;
  emoji: Emoji;
}) {
  const nativeEmoji = emoji.skins[0].native;
  if (!nativeEmoji) {
    return null;
  }
  return (
    <span className="whitespace-nowrap pr-2">
      {nativeEmoji}&nbsp;
      <span
        className={classNames(
          "text-xs",
          isHighlighted ? "font-bold text-action-500" : ""
        )}
      >
        {count}
      </span>
    </span>
  );
}
