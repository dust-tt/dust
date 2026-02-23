import { FeedbackSelectorPopoverContent } from "@app/components/assistant/conversation/FeedbackSelectorPopoverContent";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  ButtonGroup,
  Checkbox,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  HandThumbDownIcon,
  HandThumbUpIcon,
  Label,
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

const FEEDBACK_PREDEFINED_ANSWERS = [
  "Factually incorrect",
  "Didn't fully follow instructions",
  "Don't like the tone",
  "Wrong data sources",
  "Took too long",
  "Other (please explain below)",
] as const;

type FeedbackPredefinedAnswerType =
  (typeof FEEDBACK_PREDEFINED_ANSWERS)[number];

interface FeedbackSelectorProps extends FeedbackSelectorBaseProps {
  owner: LightWorkspaceType;
  agentConfigurationId: string;
  isGlobalAgent: boolean;
}

export function FeedbackSelector({
  feedback,
  onSubmitThumb,
  isSubmittingThumb,
  owner,
  agentConfigurationId,
  isGlobalAgent,
}: FeedbackSelectorProps) {
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [thumbDirection, setThumbDirection] =
    React.useState<ThumbReaction>("up");
  const [localFeedbackContent, setLocalFeedbackContent] = React.useState<
    string | null
  >(null);
  const [selectedPredefinedAnswer, setSelectedPredefinedAnswer] =
    React.useState<FeedbackPredefinedAnswerType | null>(null);
  const [isConversationShared, setIsConversationShared] = React.useState(
    feedback?.isConversationShared ?? false
  );

  const closeDialog = () => {
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
      thumb: thumbDirection,
      shouldRemoveExistingFeedback: false,
      feedbackContent: feedbackContent || null,
      isConversationShared,
    });
    closeDialog();
  };

  const handleThumbClick = async (direction: ThumbReaction) => {
    const shouldRemoveExistingFeedback = feedback?.thumb === direction;
    if (shouldRemoveExistingFeedback) {
      await onSubmitThumb({
        thumb: direction,
        shouldRemoveExistingFeedback,
        feedbackContent: null,
        isConversationShared: false,
      });
      return;
    }

    setThumbDirection(direction);
    setSelectedPredefinedAnswer(null);
    setLocalFeedbackContent(null);
    setIsConversationShared(true);
    setIsDialogOpen(true);
  };

  const canSubmit =
    thumbDirection === "up" ||
    !!selectedPredefinedAnswer ||
    (localFeedbackContent?.trim() ?? "") !== "";

  return (
    <div className="flex items-center">
      <ButtonGroup>
        <Button
          tooltip="I found this helpful"
          variant={feedback?.thumb === "up" ? "primary" : "outline"}
          size="xs"
          disabled={isSubmittingThumb}
          onClick={() => handleThumbClick("up")}
          icon={HandThumbUpIcon}
          className={feedback?.thumb === "up" ? "" : "text-muted-foreground"}
        />
        <Button
          tooltip="Report an issue with this answer"
          variant={feedback?.thumb === "down" ? "primary" : "outline"}
          size="xs"
          disabled={isSubmittingThumb}
          onClick={() => handleThumbClick("down")}
          icon={HandThumbDownIcon}
          className={feedback?.thumb === "down" ? "" : "text-muted-foreground"}
        />
      </ButtonGroup>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeDialog();
          }
        }}
      >
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>
              {thumbDirection === "down"
                ? "What’s wrong with this answer?"
                : "Glad you liked it! Tell us more?"}
            </DialogTitle>
          </DialogHeader>

          <DialogContainer>
            {isSubmittingThumb ? (
              <div className="m-3 flex items-center justify-center">
                <Spinner size="sm" />
              </div>
            ) : (
              <div className="flex flex-col gap-4 pt-2">
                {thumbDirection === "down" && (
                  <div className="flex flex-wrap gap-2">
                    {FEEDBACK_PREDEFINED_ANSWERS.map((answer) => {
                      const isSelected = selectedPredefinedAnswer === answer;
                      return (
                        <Button
                          key={answer}
                          size="xs"
                          variant={isSelected ? "primary" : "outline"}
                          label={answer}
                          onClick={() =>
                            setSelectedPredefinedAnswer(
                              isSelected ? null : answer
                            )
                          }
                        />
                      );
                    })}
                  </div>
                )}
                <TextArea
                  placeholder="Share details (optional)"
                  resize="vertical"
                  rows={5}
                  value={localFeedbackContent ?? ""}
                  onChange={(e) => setLocalFeedbackContent(e.target.value)}
                />
                <FeedbackSelectorPopoverContent
                  owner={owner}
                  agentConfigurationId={agentConfigurationId}
                  isGlobalAgent={isGlobalAgent}
                />

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="share-conversation"
                    checked={isConversationShared}
                    onCheckedChange={(value) => {
                      setIsConversationShared(!!value);
                    }}
                  />
                  <Label htmlFor="share-conversation">
                    Include my full conversation with this feedback.
                  </Label>
                </div>
              </div>
            )}
          </DialogContainer>

          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              disabled: isSubmittingThumb,
              onClick: closeDialog,
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
