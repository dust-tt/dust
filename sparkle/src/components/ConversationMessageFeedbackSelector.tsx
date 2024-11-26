import React, { useEffect, useRef } from "react";

import { Button } from "@sparkle/components/Button";
import { Page } from "@sparkle/components/Page";
import {
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "@sparkle/components/Popover";
import { TextArea } from "@sparkle/components/TextArea";
import { HandThumbDownIcon, HandThumbUpIcon } from "@sparkle/icons/solid";

export type ThumbReaction = "up" | "down";
export type ConversationMessageFeedbackType = {
  thumb: ThumbReaction;
  feedbackContent: string | null;
};
export interface ConversationMessageFeedbackSelectorProps {
  feedback: ConversationMessageFeedbackType | null;
  onSubmitThumb: (
    p: ConversationMessageFeedbackType & {
      isToRemove: boolean;
    }
  ) => Promise<void>;
  isSubmittingThumb: boolean;
}

export function FeedbackSelector(
  messageFeedback: ConversationMessageFeedbackSelectorProps
) {
  const { feedback, onSubmitThumb, isSubmittingThumb } = messageFeedback;
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
