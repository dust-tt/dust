import {
  Button,
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

const FEEDBACK_PREDEFINED_ANSWERS = [
  "Didn't search company data",
  "Should have searched the web",
  "Response too verbose",
  "Didn't follow instructions",
  "Missing or incorrect citations",
  "Didn't use available tools",
  "Not factually correct",
  "Should have spawned sub-agents",
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

  const closePopover = useCallback(() => {
    setIsDialogOpen(false);
    setSelectedPredefinedAnswer(null);
    setLocalFeedbackContent(null);
    setIsConversationShared(false);
  }, []);

  const handleSubmit = useCallback(async () => {
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
  }, [
    closePopover,
    onSubmitThumb,
    localFeedbackContent,
    isConversationShared,
    selectedPredefinedAnswer,
  ]);

  const handleThumbUp = useCallback(async () => {
    const shouldRemoveExistingFeedback = feedback?.thumb === "up";
    await onSubmitThumb({
      thumb: "up",
      shouldRemoveExistingFeedback,
      feedbackContent: null,
      isConversationShared: false,
    });
  }, [feedback?.thumb, onSubmitThumb]);

  const handleThumbDown = useCallback(async () => {
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
  }, [feedback?.thumb, onSubmitThumb]);

  const canSubmit =
    !!selectedPredefinedAnswer || (localFeedbackContent?.trim() ?? "") !== "";

  return (
    <div className="flex items-center">
      <div className="flex items-center gap-2">
        <Button
          tooltip="I found this helpful"
          variant={feedback?.thumb === "up" ? "primary" : "ghost"}
          size="xs"
          disabled={isSubmittingThumb}
          onClick={handleThumbUp}
          icon={HandThumbUpIcon}
          className={
            feedback?.thumb === "up"
              ? "text-muted-foreground dark:text-muted-foreground-night"
              : ""
          }
        />
        <Button
          tooltip="Report an issue with this answer"
          variant={feedback?.thumb === "down" ? "primary" : "ghost"}
          size="xs"
          disabled={isSubmittingThumb}
          onClick={handleThumbDown}
          icon={HandThumbDownIcon}
          className={
            feedback?.thumb === "down"
              ? "text-muted-foreground dark:text-muted-foreground-night"
              : ""
          }
        />
      </div>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closePopover();
          }
          setIsDialogOpen(open);
        }}
      >
        <DialogContent>
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
                          "s-whitespace-nowrap",
                          isSubmittingThumb &&
                            "s-cursor-not-allowed s-opacity-50",
                          isSelected
                            ? "s-border-transparent s-bg-foreground s-text-background dark:s-bg-foreground-night dark:s-text-background-night"
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

                <div className="bg-muted-background dark:bg-muted-background-night border-border dark:border-border-night rounded-lg border p-3">
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
