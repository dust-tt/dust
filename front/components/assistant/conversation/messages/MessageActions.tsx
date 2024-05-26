import { Button } from "@dust-tt/sparkle";
import type {
  MessageReactionType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import type { EmojiMartData } from "@emoji-mart/data";
import type { ComponentType, MouseEventHandler } from "react";
import { useEffect, useState } from "react";
import { useSWRConfig } from "swr";

import {
  ButtonEmoji,
  EmojiSelector,
} from "@app/components/assistant/conversation/ConversationMessage";
import { useSubmitFunction } from "@app/lib/client/utils";

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

// TODO: Rename.
function MessageEmojiSelector({
  conversationId,
  messageId,
  owner,
  reactions,
  user,
}: MessageEmojiSelectorProps) {
  // TODO: Investigate why we do a global mutate.
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
