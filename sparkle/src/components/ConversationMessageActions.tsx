import React, { useRef } from "react";

import { Button } from "@sparkle/components/Button";
import {
  DataEmojiMart,
  EmojiMartData,
  EmojiPicker,
} from "@sparkle/components/EmojiPicker";
import { Page } from "@sparkle/components/Page";
import {
  Popover,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "@sparkle/components/Popover";
import { TextArea } from "@sparkle/components/TextArea";
import {
  HandThumbDownIcon,
  HandThumbUpIcon,
  ReactionIcon,
} from "@sparkle/icons/solid";
import { cn } from "@sparkle/lib/utils";

type ConversationMessageActionsProps = {
  buttons?: React.ReactElement<typeof Button>[];
  messageEmoji?: ConversationMessageEmojiSelectorProps;
  messageThumb?: ConversationMessageThumbSelectorProps;
};

export function ConversationMessageActions({
  buttons = [],
  messageEmoji,
  messageThumb,
}: ConversationMessageActionsProps) {
  if (messageThumb) {
    buttons.push(
      <ConversationMessageThumbsSelector
        key="thumbs-selector"
        onSubmitThumb={messageThumb.onSubmitThumb}
        isSubmittingThumb={messageThumb.isSubmittingThumb}
      />
    );
  }

  if (messageEmoji) {
    buttons.push(
      <ConversationMessageEmojiSelector
        key="emoji-selector"
        reactions={messageEmoji.reactions}
        onSubmitEmoji={messageEmoji.onSubmitEmoji}
        isSubmittingEmoji={messageEmoji.isSubmittingEmoji}
      />
    );
  }

  if (buttons.length === 0) {
    return false;
  }

  return <div className="s-flex s-justify-end s-gap-2">{buttons}</div>;
}

const MAX_MORE_REACTIONS_TO_SHOW = 9;

export type EmojoReaction = {
  emoji: string;
  hasReacted: boolean;
  count: number;
};
export interface ConversationMessageEmojiSelectorProps {
  reactions: EmojoReaction[];
  onSubmitEmoji: (p: { emoji: string; isToRemove: boolean }) => Promise<void>;
  isSubmittingEmoji: boolean;
}

export type ThumbReaction = "up" | "down";
export interface ConversationMessageThumbSelectorProps {
  onSubmitThumb: (p: {
    thumb: string;
    isToRemove: boolean;
    feedback?: string | null;
  }) => Promise<void>;
  isSubmittingThumb: boolean;
}

function ConversationMessageEmojiSelector({
  reactions,
  onSubmitEmoji,
  isSubmittingEmoji,
}: ConversationMessageEmojiSelectorProps) {
  const emojiData = DataEmojiMart as EmojiMartData;

  let slicedReactions = [...reactions];
  let hasMoreReactions = null;
  if (slicedReactions.length > MAX_MORE_REACTIONS_TO_SHOW) {
    hasMoreReactions = slicedReactions.length - MAX_MORE_REACTIONS_TO_SHOW;
    slicedReactions = slicedReactions.slice(0, MAX_MORE_REACTIONS_TO_SHOW);
  }

  return (
    <>
      <EmojiSelector
        reactions={reactions}
        onSubmitEmoji={onSubmitEmoji}
        emojiData={emojiData}
        isSubmittingEmoji={isSubmittingEmoji}
      />
      {slicedReactions.map((reaction, index) => {
        const hasReacted = reaction.hasReacted;
        const emoji = emojiData?.emojis[reaction.emoji];
        const nativeEmoji = emoji?.skins[0].native;
        if (!nativeEmoji) {
          return null;
        }
        return (
          <ButtonEmoji
            key={`${reaction.emoji}-${index}`}
            variant={hasReacted ? "selected" : "unselected"}
            emoji={nativeEmoji}
            count={reaction.count.toString()}
            onClick={async () =>
              onSubmitEmoji({
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
      className={cn(
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
  reactions,
  onSubmitEmoji,
  emojiData,
  isSubmittingEmoji = false,
}: {
  emojiData: EmojiMartData | null;
} & ConversationMessageEmojiSelectorProps) {
  const buttonRef = useRef<HTMLDivElement>(null);

  return (
    <Popover
      fullWidth
      popoverTriggerAsChild
      trigger={
        <div ref={buttonRef}>
          <Button
            variant="outline"
            size="xs"
            icon={ReactionIcon}
            isSelect
            disabled={isSubmittingEmoji}
          />
        </div>
      }
      content={
        <EmojiPicker
          theme="light"
          previewPosition="none"
          data={emojiData ?? undefined}
          onEmojiSelect={async (emojiData) => {
            const reaction = reactions.find((r) => r.emoji === emojiData.id);
            const hasReacted = reaction ? reaction.hasReacted : false;
            await onSubmitEmoji({
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

function ConversationMessageThumbsSelector({
  onSubmitThumb,
  isSubmittingThumb,
}: ConversationMessageThumbSelectorProps) {
  return (
    <>
      <ThumbsSelector
        isSubmittingThumb={isSubmittingThumb}
        onSubmitThumb={onSubmitThumb}
      />
    </>
  );
}

function ThumbsSelector({
  isSubmittingThumb = false,
  onSubmitThumb,
}: ConversationMessageThumbSelectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const selectThumb = async (thumb: ThumbReaction) => {
    if (selectedThumb === thumb) {
      setSelectedThumb(null);
      setIsPopoverOpen(false);
      await onSubmitThumb({ thumb, isToRemove: true });
      return;
    }
    setSelectedThumb(thumb);
    setIsPopoverOpen(true);
    await onSubmitThumb({ thumb, isToRemove: false });
  };

  const [selectedThumb, setSelectedThumb] =
    React.useState<ThumbReaction | null>(null);
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);

  return (
    <div
      ref={containerRef}
      className="s-inline-flex s-h-7 s-items-center s-justify-center s-whitespace-nowrap s-rounded-lg s-border s-border-border-dark s-bg-background s-px-2.5 s-text-xs s-font-medium s-text-primary-dark s-ring-offset-background s-transition-colors hover:s-border-primary-150 hover:s-bg-primary-150 hover:s-text-primary focus-visible:s-outline-none focus-visible:s-ring-2 focus-visible:s-ring-ring focus-visible:s-ring-offset-2 active:s-bg-primary-300 disabled:s-pointer-events-none disabled:s-border-structure-100 disabled:s-text-primary-muted"
    >
      <PopoverRoot open={isPopoverOpen}>
        <PopoverTrigger>
          <div className="s-flex s-items-center">
            <button
              disabled={isSubmittingThumb}
              onClick={() => selectThumb("up")}
              className={`s-p-1.5 hover:s-text-blue-600 disabled:s-cursor-not-allowed disabled:s-opacity-50 ${
                selectedThumb === "up" ? "s-text-blue-600" : ""
              }`}
            >
              <HandThumbUpIcon className="s-h-4 s-w-4" />
            </button>
            <button
              disabled={isSubmittingThumb}
              onClick={() => selectThumb("down")}
              className={`s-p-1.5 hover:s-text-blue-600 disabled:s-cursor-not-allowed disabled:s-opacity-50 ${
                selectedThumb === "down" ? "s-text-blue-600" : ""
              }`}
            >
              <HandThumbDownIcon className="s-h-4 s-w-4" />
            </button>
          </div>
        </PopoverTrigger>
        <PopoverContent fullWidth={true}>
          <div className="s-w-80 s-p-4">
            <Page.H variant="h6">
              {selectedThumb === "up"
                ? "🎉 Glad you liked it! Tell us more?"
                : "🫠 Help make the answers better!"}
            </Page.H>
            <TextArea
              placeholder={
                selectedThumb === "up"
                  ? "What did you like?"
                  : "Tell us what went wrong so we can make this assistant better."
              }
              className="s-mt-4"
              value={feedback ?? ""}
              onChange={(e) => setFeedback(e.target.value)}
            />
            <div className="s-mt-4 s-flex s-justify-between s-gap-2">
              <Button
                variant="primary"
                label="Submit feedback"
                onClick={async () => {
                  await onSubmitThumb({
                    thumb: selectedThumb ?? "up",
                    isToRemove: false,
                    feedback: feedback,
                  });
                  setIsPopoverOpen(false);
                }}
              />
              <Button
                variant="ghost"
                label="Cancel"
                onClick={() => setIsPopoverOpen(false)}
              />
            </div>
          </div>
        </PopoverContent>
      </PopoverRoot>
    </div>
  );
}
