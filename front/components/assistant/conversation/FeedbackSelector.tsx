import {
  Button,
  ButtonGroup,
  Checkbox,
  HandThumbDownIcon,
  HandThumbUpIcon,
  Page,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  Spinner,
  TextArea,
} from "@dust-tt/sparkle";
import React, { useCallback, useEffect, useRef } from "react";

import type { WorkspaceType } from "@app/types";

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
  getPopoverInfo?: () => React.JSX.Element | null;
  owner: WorkspaceType;
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
        // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const selectThumb = async (thumb: ThumbReaction) => {
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
  };

  const handleThumbUp = async () => {
    await selectThumb("up");
  };

  const handleThumbDown = async () => {
    await selectThumb("down");
  };

  const handleTextAreaChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setLocalFeedbackContent(e.target.value);
    },
    []
  );

  const closePopover = () => {
    setIsPopoverOpen(false);
  };

  const handleSubmit = async () => {
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
  };

  return (
    <div ref={containerRef} className="flex items-center">
      <PopoverRoot open={isPopoverOpen}>
        <PopoverTrigger asChild>
          <ButtonGroup
            variant="outline"
            items={[
              {
                type: "button",
                props: {
                  tooltip: "I found this helpful",
                  variant:
                    feedback?.thumb === "up" ? "primary" : "ghost-secondary",
                  size: "xs",
                  disabled: isSubmittingThumb,
                  onClick: handleThumbUp,
                  icon: HandThumbUpIcon,
                  className:
                    feedback?.thumb === "up" ? "" : "text-muted-foreground",
                },
              },
              {
                type: "button",
                props: {
                  tooltip: "Report an issue with this answer",
                  variant:
                    feedback?.thumb === "down" ? "primary" : "ghost-secondary",
                  size: "xs",
                  disabled: isSubmittingThumb,
                  onClick: handleThumbDown,
                  icon: HandThumbDownIcon,
                  className:
                    feedback?.thumb === "down" ? "" : "text-muted-foreground",
                },
              },
            ]}
          />
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
                    : "Tell us what went wrong so we can make this agent better."
                }
                className="mb-4 mt-4"
                resize="vertical"
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
