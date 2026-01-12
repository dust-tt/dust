import {
  Button,
  Checkbox,
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
import React from "react";

export type ThumbReaction = "up" | "down";

export type FeedbackType = {
  thumb: ThumbReaction;
  feedbackContent: string | null;
  isConversationShared: boolean;
};

export interface FeedbackSelectorBaseProps {
  feedback: FeedbackType | null;
  onSubmitThumb: (
    p: FeedbackType & {
      shouldRemoveExistingFeedback: boolean;
    }
  ) => Promise<void>;
  isSubmittingThumb: boolean;
}

export interface FeedbackSelectorProps extends FeedbackSelectorBaseProps {
  isGlobalAgent: boolean;
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
  isGlobalAgent,
}: FeedbackSelectorProps) {
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [localFeedbackContent, setLocalFeedbackContent] = React.useState<
    string | null
  >(null);
  const [selectedPredefinedAnswer, setSelectedPredefinedAnswer] =
    React.useState<FeedbackPredefinedAnswerType | null>(null);
  const [isConversationShared, setIsConversationShared] = React.useState(
    feedback?.isConversationShared ?? false
  );

  const dialogPopoverInfo = isDialogOpen ? (
    <div className="mb-4 mt-2 flex flex-col gap-2">
      <Page.P variant="secondary">
        {isGlobalAgent
          ? "Submitting feedback will help Dust improve your global agents."
          : "Your feedback is available to editors of the agent."}
      </Page.P>
    </div>
  ) : null;

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
      <div className="flex items-center gap-2">
        <Button
          tooltip="I found this helpful"
          variant={feedback?.thumb === "up" ? "primary" : "ghost"}
          size="xs"
          disabled={isSubmittingThumb}
          onClick={handleThumbUp}
          icon={HandThumbUpIcon}
          className="text-muted-foreground dark:text-muted-foreground-night"
        />
        <Button
          tooltip="Report an issue with this answer"
          variant={feedback?.thumb === "down" ? "primary" : "ghost"}
          size="xs"
          disabled={isSubmittingThumb}
          onClick={handleThumbDown}
          icon={HandThumbDownIcon}
          className="text-muted-foreground dark:text-muted-foreground-night"
        />
      </div>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closePopover();
          }
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
                      <Button
                        key={answer}
                        size="xs"
                        color={isSelected ? "primary" : "outline"}
                        label={answer}
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
                  onChange={(e) => {
                    setLocalFeedbackContent(e.target.value);
                  }}
                />

                {dialogPopoverInfo}

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
