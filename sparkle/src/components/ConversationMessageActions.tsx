import React, { useEffect, useRef } from "react";

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
  messageFeedback?: ConversationMessageFeedbackSelectorProps;
};

export function ConversationMessageActions({
  buttons = [],
  messageEmoji,
  messageFeedback,
}: ConversationMessageActionsProps) {
  if (messageFeedback) {
    buttons.push(
      <ConversationMessageFeedbackSelector
        key="thumbs-selector"
        feedback={messageFeedback.feedback}
        onSubmitThumb={messageFeedback.onSubmitThumb}
        isSubmittingThumb={messageFeedback.isSubmittingThumb}
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
export type ConversationMessageFeedbackType = {
  thumb: ThumbReaction;
  feedbackContent: string | null;
};
export interface ConversationMessageFeedbackSelectorProps {
  feedback: ConversationMessageFeedbackType;
  onSubmitThumb: (
    p: ConversationMessageFeedbackType & {
      isToRemove: boolean;
    }
  ) => Promise<void>;
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

function ConversationMessageFeedbackSelector({
  feedback,
  onSubmitThumb,
  isSubmittingThumb,
}: ConversationMessageFeedbackSelectorProps) {
  return (
    <ThumbsSelector
      feedback={feedback}
      isSubmittingThumb={isSubmittingThumb}
      onSubmitThumb={onSubmitThumb}
    />
  );
}

function ThumbsSelector({
  feedback,
  isSubmittingThumb = false,
  onSubmitThumb,
}: ConversationMessageFeedbackSelectorProps) {
  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [localFeedbackContent, setLocalFeedbackContent] = React.useState<
    string | null
  >(null);

  // Reset local feedback content when popup opens
  useEffect(() => {
    if (isPopoverOpen) {
      setLocalFeedbackContent(feedback?.feedbackContent ?? null);
    }
  }, [isPopoverOpen, feedback?.feedbackContent]);

  const selectThumb = async (thumb: ThumbReaction) => {
    const isToRemove = feedback?.thumb === thumb;
    setIsPopoverOpen(!isToRemove);

    await onSubmitThumb({
      feedbackContent: localFeedbackContent,
      thumb,
      isToRemove,
    });
  };

  return (
    <div ref={containerRef} className="s-flex s-items-center">
      <PopoverRoot open={isPopoverOpen}>
        <PopoverTrigger asChild>
          <div className="s-flex s-items-center">
            <Button
              variant={feedback?.thumb === "up" ? "highlight" : "outline"}
              size="xs"
              disabled={isSubmittingThumb}
              onClick={() => selectThumb("up")}
              className={"s-rounded-r-none s-border-r-0"}
              icon={HandThumbUpIcon}
            />
            <Button
              variant={feedback?.thumb === "down" ? "highlight" : "outline"}
              size="xs"
              disabled={isSubmittingThumb}
              onClick={() => selectThumb("down")}
              className={"s-rounded-l-none s-border-l-0"}
              icon={HandThumbDownIcon}
            />
          </div>
        </PopoverTrigger>
        <PopoverContent fullWidth={true}>
          <div className="s-w-80 s-p-4">
            <Page.H variant="h6">
              {feedback?.thumb === "up"
                ? "🎉 Glad you liked it! Tell us more?"
                : "🫠 Help make the answers better!"}
            </Page.H>
            <TextArea
              placeholder={
                feedback?.thumb === "up"
                  ? "What did you like?"
                  : "Tell us what went wrong so we can make this assistant better."
              }
              className="s-mt-4"
              rows={3}
              value={localFeedbackContent ?? ""}
              onChange={(e) => setLocalFeedbackContent(e.target.value)}
            />
            <div className="s-mt-4 s-flex s-justify-between s-gap-2">
              <Button
                variant="primary"
                label="Submit feedback"
                onClick={async () => {
                  await onSubmitThumb({
                    thumb: feedback?.thumb ?? "up",
                    isToRemove: false,
                    feedbackContent: localFeedbackContent,
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
