import { Button } from "@dust-tt/sparkle";
import { Checkbox } from "@dust-tt/sparkle";
import { Page } from "@dust-tt/sparkle";
import { PopoverContent, PopoverRoot, PopoverTrigger } from "@dust-tt/sparkle";
import { Spinner } from "@dust-tt/sparkle";
import { TextArea } from "@dust-tt/sparkle";
import { Tooltip } from "@dust-tt/sparkle";
import { HandThumbDownIcon, HandThumbUpIcon } from "@dust-tt/sparkle";
import React, { useCallback, useEffect, useRef } from "react";

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
      shouldRemoveExistingFeedback: boolean;
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
    feedback?.thumb,
  ]);

  const selectThumb = useCallback(
    async (thumb: ThumbReaction) => {
      const shouldRemoveExistingFeedback = feedback?.thumb === thumb;
      setIsPopoverOpen(!shouldRemoveExistingFeedback);
      setLastSelectedThumb(shouldRemoveExistingFeedback ? null : thumb);
      setIsConversationShared(thumb === "down");

      // We enforce written feedback for thumbs down.
      // -> Not saving the reaction until then.
      if (thumb === "down" && !shouldRemoveExistingFeedback) {
        return;
      }

      await onSubmitThumb({
        feedbackContent: localFeedbackContent,
        thumb,
        shouldRemoveExistingFeedback,
        isConversationShared: false,
      });
    },
    [feedback?.thumb, localFeedbackContent, onSubmitThumb]
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
        shouldRemoveExistingFeedback: false,
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

  const baseButtonClasses = `s-inline-flex s-items-center s-justify-center s-whitespace-nowrap s-font-medium s-ring-offset-background s-transition-colors focus-visible:s-outline-none focus-visible:s-ring-2 focus-visible:s-ring-ring focus-visible:s-ring-offset-2 disabled:s-pointer-events-none s-border s-border-primary-200/0 s-text-primary-950 hover:s-bg-primary-150 hover:s-text-primary-900 hover:s-border-primary-150 active:s-bg-primary-300 disabled:s-text-primary-400 s-h-7 s-px-2.5 s-rounded-lg s-text-xs s-gap-1.5`;

  return (
    <div ref={containerRef} className="flex items-center">
      <PopoverRoot open={isPopoverOpen}>
        <PopoverTrigger asChild>
          <div className="flex items-center gap-2">
            <Tooltip
              label="I found this helpful"
              trigger={
                <div
                  role="button"
                  tabIndex={0}
                  onClick={handleThumbUp}
                  className={`${baseButtonClasses} ${
                    isSubmittingThumb
                      ? "disabled:s-pointer-events-none opacity-50"
                      : ""
                  } ${
                    feedback?.thumb === "up"
                      ? "s-bg-primary s-text-white hover:s-bg-primary/90"
                      : "text-muted-foreground"
                  }`}
                >
                  <HandThumbUpIcon className="h-4 w-4" />
                </div>
              }
            />
            <Tooltip
              label="Report an issue with this answer"
              trigger={
                <div
                  role="button"
                  tabIndex={0}
                  onClick={handleThumbDown}
                  className={`${baseButtonClasses} ${
                    isSubmittingThumb
                      ? "disabled:s-pointer-events-none opacity-50"
                      : ""
                  } ${
                    feedback?.thumb === "down"
                      ? "s-bg-primary s-text-white hover:s-bg-primary/90"
                      : "text-muted-foreground"
                  }`}
                >
                  <HandThumbDownIcon className="h-4 w-4" />
                </div>
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
            <div className="m-3 flex items-center justify-center">
              <Spinner size="sm" />
            </div>
          ) : (
            <div className="w-80 p-4">
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
                className="mb-4 mt-4"
                rows={3}
                value={localFeedbackContent ?? ""}
                onChange={handleTextAreaChange}
              />
              {popOverInfo}
              <div className="mt-2 flex items-center gap-2">
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
              <div className="mt-4 flex justify-end gap-2">
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
