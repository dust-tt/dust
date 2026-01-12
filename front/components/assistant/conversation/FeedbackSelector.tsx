import {
  ButtonGroup,
  Checkbox,
  Chip,
  cn,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  HandThumbDownIcon,
  HandThumbUpIcon,
  Page,
  Spinner,
  TextArea,
} from "@dust-tt/sparkle";
import React, { useCallback, useEffect } from "react";

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

const FEEDBACK_PREDEFINED_ANSWERS = [
  "Didn't search company data",
  "Should have searched the web",
  "Response too verbose",
  "Didn't follow instructions",
  "Missing or incorrect citations",
  "Didn't use available tools",
  "Not factually correct",
  "Should have spawned sub-agents",
  "Others",
] as const;

type FeedbackPredefinedAnswerType =
  (typeof FEEDBACK_PREDEFINED_ANSWERS)[number];

export function FeedbackSelector({
  feedback,
  onSubmitThumb,
  isSubmittingThumb,
  getPopoverInfo,
}: FeedbackSelectorProps) {
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [localFeedbackContent, setLocalFeedbackContent] = React.useState<
    string | null
  >(null);
  const [selectedPredefinedAnswer, setSelectedPredefinedAnswer] =
    React.useState<FeedbackPredefinedAnswerType | null>(null);
  const [popOverInfo, setPopoverInfo] = React.useState<JSX.Element | null>(
    null
  );
  const [isConversationShared, setIsConversationShared] = React.useState(
    feedback?.isConversationShared ?? false
  );

  useEffect(() => {
    if (isDialogOpen) {
      if (getPopoverInfo) {
        setPopoverInfo(getPopoverInfo());
      }
    }
  }, [isDialogOpen, getPopoverInfo]);

  const handleTextAreaChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setLocalFeedbackContent(e.target.value);
    },
    []
  );

  const closePopover = () => {
    setIsDialogOpen(false);
    setSelectedPredefinedAnswer(null);
    setLocalFeedbackContent(null);
    setIsConversationShared(false);
  };

  const handleSubmit = async () => {
    const details = localFeedbackContent?.trim() ?? "";
    const predefinedAnswer = selectedPredefinedAnswer?.trim() ?? "";

    const feedbackContent = [predefinedAnswer, details]
      .filter(Boolean)
      .join("\n\n");

    await onSubmitThumb({
      thumb: "down",
      shouldRemoveExistingFeedback: false,
      feedbackContent,
      isConversationShared,
    });
    closePopover();
  };

  const handleThumbUp = async () => {
    const shouldRemoveExistingFeedback = feedback?.thumb === "up";
    await onSubmitThumb({
      thumb: "up",
      shouldRemoveExistingFeedback,
      feedbackContent: null,
      isConversationShared: false,
    });
  };

  const handleThumbDown = async () => {
    const shouldRemoveExistingFeedback = feedback?.thumb === "down";
    if (shouldRemoveExistingFeedback) {
      await onSubmitThumb({
        thumb: "down",
        shouldRemoveExistingFeedback,
        feedbackContent: null,
        isConversationShared: false,
      });
      return;
    }

    setSelectedPredefinedAnswer(null);
    setLocalFeedbackContent(null);
    setIsConversationShared(true);
    setIsDialogOpen(true);
  };

  const canSubmit =
    !!selectedPredefinedAnswer || (localFeedbackContent?.trim() ?? "") !== "";

  return (
    <div className="flex items-center">
      <ButtonGroup
        variant="outline"
        items={[
          {
            type: "button",
            props: {
              tooltip: "I found this helpful",
              variant: feedback?.thumb === "up" ? "primary" : "ghost-secondary",
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

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closePopover();
          }
          setIsDialogOpen(open);
        }}
      >
        <DialogContent height="md" size="lg">
          <DialogHeader>
            <DialogTitle>Share feedback</DialogTitle>
          </DialogHeader>

          <DialogContainer>
            {isSubmittingThumb ? (
              <div className="m-3 flex items-center justify-center">
                <Spinner size="sm" />
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap gap-2">
                  {FEEDBACK_PREDEFINED_ANSWERS.map((answer) => {
                    const isSelected = selectedPredefinedAnswer === answer;
                    return (
                      <Chip
                        key={answer}
                        size="xs"
                        color="primary"
                        label={answer}
                        className={cn(
                          isSubmittingThumb && "cursor-not-allowed opacity-50",
                          isSelected
                            ? "border-transparent bg-foreground text-background dark:bg-foreground-night dark:text-background-night"
                            : undefined
                        )}
                        onClick={
                          isSubmittingThumb
                            ? undefined
                            : () =>
                                setSelectedPredefinedAnswer(
                                  isSelected ? null : answer
                                )
                        }
                      />
                    );
                  })}
                </div>
                <TextArea
                  placeholder="Share details (optional)"
                  resize="vertical"
                  rows={3}
                  value={localFeedbackContent ?? ""}
                  onChange={handleTextAreaChange}
                />
                {popOverInfo}
                <div
                  className={cn(
                    "rounded-lg border p-3",
                    "border-border bg-muted-background",
                    "dark:border-border-night dark:bg-muted-background-night"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={isConversationShared}
                      onCheckedChange={(value) => {
                        setIsConversationShared(!!value);
                      }}
                    />
                    <Page.P variant="secondary">
                      Include my full conversation with this feedback.
                    </Page.P>
                  </div>
                </div>
              </div>
            )}
          </DialogContainer>

          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              disabled: isSubmittingThumb,
              onClick: closePopover,
            }}
            rightButtonProps={{
              label: "Submit",
              variant: "primary",
              onClick: handleSubmit,
              disabled: isSubmittingThumb || !canSubmit,
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
