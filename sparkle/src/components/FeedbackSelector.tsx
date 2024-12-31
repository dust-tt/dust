import React, { useCallback, useEffect, useRef } from "react";

import { Button } from "@sparkle/components/Button";
import { Checkbox } from "@sparkle/components/Checkbox";
import { Page } from "@sparkle/components/Page";
import {
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "@sparkle/components/Popover";
import Spinner from "@sparkle/components/Spinner";
import { TextArea } from "@sparkle/components/TextArea";
import { Tooltip } from "@sparkle/components/Tooltip";
import { HandThumbDownIcon, HandThumbUpIcon } from "@sparkle/icons/solid";

export type ThumbReaction = "up" | "down";

export type FeedbackType = {
  thumb: ThumbReaction;
  feedbackContent: string | null;
  isConversationShared: boolean;
};

export interface FeedbackSelectorProps {
  feedback: FeedbackType | null;
  onSubmitThumb: (
    p: FeedbackType & {
      isToRemove: boolean;
    }
  ) => Promise<void>;
  isSubmittingThumb: boolean;
  getPopoverInfo?: () => JSX.Element | null;
}

export function FeedbackSelector({
  feedback,
  onSubmitThumb,
  isSubmittingThumb,
  getPopoverInfo,
}: FeedbackSelectorProps) {
  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [localFeedbackContent, setLocalFeedbackContent] = React.useState<
    string | null
  >(null);
  const [popOverInfo, setPopoverInfo] = React.useState<JSX.Element | null>(
    null
  );
  const [isConversationShared, setIsConversationShared] = React.useState(
    feedback?.isConversationShared ?? false
  );
  // This is required to adjust the content of the popover even when feedback is null.
  const [lastSelectedThumb, setLastSelectedThumb] =
    React.useState<ThumbReaction | null>(feedback?.thumb ?? null);

  useEffect(() => {
    if (isPopoverOpen) {
      if (getPopoverInfo) {
        setPopoverInfo(getPopoverInfo());
      }
      if (feedback?.thumb === lastSelectedThumb) {
        setLocalFeedbackContent(feedback?.feedbackContent ?? null);
      }
    }
  }, [
    isPopoverOpen,
    feedback?.feedbackContent,
    getPopoverInfo,
    lastSelectedThumb,
  ]);

  const selectThumb = useCallback(
    async (thumb: ThumbReaction) => {
      // Whether to remove the thumb reaction
      const isToRemove = feedback?.thumb === thumb;
      setIsPopoverOpen(!isToRemove);
      setLastSelectedThumb(isToRemove ? null : thumb);

      // Checkbox ticked by default only for new thumbs down
      setIsConversationShared(thumb === "down");

      // We enforce written feedback for thumbs down.
      // -> Not saving the reaction until then.
      if (thumb === "down" && !isToRemove) {
        return;
      }

      await onSubmitThumb({
        feedbackContent: localFeedbackContent,
        thumb,
        isToRemove,
        // The sharing option was never displayed so far -> Opt out of sharing.
        isConversationShared: false,
      });
    },
    [feedback?.thumb, localFeedbackContent, onSubmitThumb, isConversationShared]
  );

  const handleThumbUp = useCallback(async () => {
    await selectThumb("up");
  }, [selectThumb]);

  const handleThumbDown = useCallback(async () => {
    await selectThumb("down");
  }, [selectThumb]);

  const handleTextAreaChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setLocalFeedbackContent(e.target.value);
    },
    []
  );

  const closePopover = useCallback(() => {
    setIsPopoverOpen(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    setIsPopoverOpen(false);
    if (lastSelectedThumb) {
      await onSubmitThumb({
        thumb: lastSelectedThumb,
        isToRemove: false,
        feedbackContent: localFeedbackContent,
        isConversationShared,
      });
      setLocalFeedbackContent(null);
    }
  }, [
    onSubmitThumb,
    localFeedbackContent,
    isConversationShared,
    lastSelectedThumb,
  ]);

  return (
    <div ref={containerRef} className="s-flex s-items-center">
      <PopoverRoot open={isPopoverOpen}>
        <PopoverTrigger asChild>
          <div className="s-flex s-items-center s-gap-2">
            <Tooltip
              label="I found this helpful"
              trigger={
                <Button
                  variant={feedback?.thumb === "up" ? "primary" : "ghost"}
                  size="xs"
                  disabled={isSubmittingThumb}
                  onClick={handleThumbUp}
                  icon={HandThumbUpIcon}
                  className={
                    feedback?.thumb === "up"
                      ? ""
                      : "[&_svg]:s-text-muted-foreground"
                  }
                />
              }
            />
            <Tooltip
              label="Report an issue with this answer"
              trigger={
                <Button
                  variant={feedback?.thumb === "down" ? "primary" : "ghost"}
                  size="xs"
                  disabled={isSubmittingThumb}
                  onClick={handleThumbDown}
                  icon={HandThumbDownIcon}
                  className={
                    feedback?.thumb === "down"
                      ? ""
                      : "[&_svg]:s-text-muted-foreground"
                  }
                />
              }
            />
          </div>
        </PopoverTrigger>
        <PopoverContent
          fullWidth={true}
          onInteractOutside={closePopover}
          onEscapeKeyDown={closePopover}
        >
          {isSubmittingThumb ? (
            <div className="m-3 s-flex s-items-center s-justify-center">
              <Spinner size="sm" />
            </div>
          ) : (
            <div className="s-w-80 s-p-4">
              <Page.H variant="h6">
                {lastSelectedThumb === "up"
                  ? "🎉 Glad you liked it! Tell us more?"
                  : "🫠 Help make the answers better!"}
              </Page.H>
              <TextArea
                placeholder={
                  lastSelectedThumb === "up"
                    ? "What did you like?"
                    : "Tell us what went wrong so we can make this assistant better."
                }
                className="s-mb-4 s-mt-4"
                rows={3}
                value={localFeedbackContent ?? ""}
                onChange={handleTextAreaChange}
              />

              {popOverInfo}
              <div className="s-mt-2 s-flex s-items-center s-gap-2">
                <Checkbox
                  checked={isConversationShared}
                  onCheckedChange={(value) => {
                    setIsConversationShared(!!value);
                  }}
                />
                <Page.P variant="secondary">
                  By clicking, you accept to share your full conversation
                </Page.P>
              </div>
              <div className="s-mt-4 s-flex s-justify-end s-gap-2">
                <Button
                  variant="primary"
                  label="Submit feedback"
                  onClick={handleSubmit}
                  disabled={
                    !localFeedbackContent ||
                    localFeedbackContent.trim() === "" ||
                    isSubmittingThumb
                  }
                />
              </div>
            </div>
          )}
        </PopoverContent>
      </PopoverRoot>
    </div>
  );
}
