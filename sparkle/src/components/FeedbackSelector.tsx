import React, { useEffect, useRef } from "react";

import { Button } from "@sparkle/components/Button";
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

export type FeedbackAssistantBuilder = {
  name: string;
  pictureUrl: string;
};

export type ThumbReaction = "up" | "down";

export type FeedbackType = {
  thumb: ThumbReaction;
  feedbackContent: string | null;
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

  useEffect(() => {
    if (isPopoverOpen) {
      if (getPopoverInfo) {
        setPopoverInfo(getPopoverInfo());
      }
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
          <div className="s-flex s-items-center s-gap-2">
            <Tooltip
              label="I found this helpful"
              trigger={
                <Button
                  variant={feedback?.thumb === "up" ? "primary" : "ghost"}
                  size="xs"
                  disabled={isSubmittingThumb}
                  onClick={() => selectThumb("up")}
                  icon={HandThumbUpIcon}
                  className={feedback?.thumb === "up" ? "" : "[&_svg]:s-text-muted-foreground"}
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
                  onClick={() => selectThumb("down")}
                  icon={HandThumbDownIcon}
                  className={feedback?.thumb === "down" ? "" : "[&_svg]:s-text-muted-foreground"}
                />
              }
            />
          </div>
        </PopoverTrigger>
        <PopoverContent fullWidth={true}>
          {isSubmittingThumb ? (
            <div className="m-3 s-flex s-items-center s-justify-center">
              <Spinner size="sm" />
            </div>
          ) : (
            <div className="s-w-80 s-p-4">
              <Page.H variant="h6">
                {feedback?.thumb === "up"
                  ? "🎉 Glad you liked it! Tell us more?"
                  : "🫠 Help make the answers better!"}
              </Page.H>
              {popOverInfo}
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
                  label="Skip"
                  onClick={() => setIsPopoverOpen(false)}
                />
              </div>
            </div>
          )}
        </PopoverContent>
      </PopoverRoot>
    </div>
  );
}
