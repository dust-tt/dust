import { FeedbackSelectorPopoverContent } from "@app/components/assistant/conversation/FeedbackSelectorPopoverContent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
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
  HandThumbUpIcon,
  Label,
  MagicIcon,
  Spinner,
  TextArea,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import React from "react";
import { useController, useForm } from "react-hook-form";
import { z } from "zod";

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

interface FeedbackSelectorProps extends FeedbackSelectorBaseProps {
  owner: LightWorkspaceType;
  agentConfigurationId: string;
  agentName: string;
  isGlobalAgent: boolean;
}

const OTHER_ANSWER = "Other (add details below)";

const FEEDBACK_PREDEFINED_ANSWERS = [
  "Factually incorrect",
  "Didn’t fully follow instructions",
  "Don’t like the tone",
  "Wrong data sources",
  "Took too long",
  OTHER_ANSWER,
] as const;

const feedbackBaseSchema = z.object({
  selectedAnswer: z.string().default(""),
  feedbackContent: z.string().default(""),
  isConversationShared: z.boolean().default(true),
});

function makeFeedbackSchema(
  thumbDirection: ThumbReaction,
  showPredefinedAnswers: boolean
) {
  if (thumbDirection === "up") {
    return feedbackBaseSchema;
  }

  // Valid when: a non-"Other" predefined answer is selected, or free text is provided.
  // Note: we are not using superRefine here because thumbDirection is not a form value.
  return feedbackBaseSchema.refine(
    (data) => {
      const hasAnswer =
        showPredefinedAnswers &&
        data.selectedAnswer.length > 0 &&
        data.selectedAnswer !== OTHER_ANSWER;
      const hasContent = data.feedbackContent.trim().length > 0;

      return hasAnswer || hasContent;
    },
    {
      message: showPredefinedAnswers
        ? "Please select a reason or describe the issue."
        : "Please describe the issue.",
      path: ["feedbackContent"],
    }
  );
}

type FeedbackFormValues = z.infer<ReturnType<typeof makeFeedbackSchema>>;

export function FeedbackSelector({
  feedback,
  onSubmitThumb,
  isSubmittingThumb,
  owner,
  agentConfigurationId,
  agentName,
  isGlobalAgent,
}: FeedbackSelectorProps) {
  const isSidekick = agentConfigurationId === GLOBAL_AGENTS_SID.SIDEKICK;
  // Predefined answers are not so relevant in the context of sidekick.
  const showPredefinedAnswers = !isSidekick;

  // "Improve this agent" would be confusing in the context of sidekick so we show "Improve @sidekick" instead
  const improveLabel = isSidekick
    ? `Improve @${agentName}`
    : "Improve this agent";

  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [thumbDirection, setThumbDirection] =
    React.useState<ThumbReaction>("up");

  const form = useForm<FeedbackFormValues>({
    resolver: zodResolver(
      makeFeedbackSchema(thumbDirection, showPredefinedAnswers)
    ),
    defaultValues: feedbackBaseSchema.parse({}),
  });

  const selectedAnswerField = useController({
    control: form.control,
    name: "selectedAnswer",
  });
  const feedbackContentField = useController({
    control: form.control,
    name: "feedbackContent",
  });
  const isConversationSharedField = useController({
    control: form.control,
    name: "isConversationShared",
  });

  const openDialog = (direction: ThumbReaction) => {
    setThumbDirection(direction);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    form.reset();
  };

  const handleSubmit = form.handleSubmit(async (data) => {
    const predefinedAnswer = data.selectedAnswer.trim();
    const details = data.feedbackContent.trim();

    const feedbackContent =
      [predefinedAnswer, details].filter(Boolean).join("\n\n") || null;

    await onSubmitThumb({
      thumb: thumbDirection,
      shouldRemoveExistingFeedback: false,
      feedbackContent,
      isConversationShared: data.isConversationShared,
    });
    closeDialog();
  });

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

    openDialog(direction);
  };

  return (
    <div className="flex items-center">
      <ButtonGroup>
        <Button
          variant={feedback?.thumb === "up" ? "primary" : "outline"}
          size="xs"
          disabled={isSubmittingThumb}
          onClick={() => handleThumbClick("up")}
          icon={HandThumbUpIcon}
          className={feedback?.thumb === "up" ? "" : "text-muted-foreground"}
        />
        <Button
          variant={feedback?.thumb === "down" ? "primary" : "outline"}
          size="xs"
          disabled={isSubmittingThumb}
          onClick={() => handleThumbClick("down")}
          icon={MagicIcon}
          label={improveLabel}
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
            <DialogTitle>Give feedback on @{agentName}</DialogTitle>
          </DialogHeader>

          <DialogContainer className="py-3">
            {isSubmittingThumb ? (
              <div className="m-3 flex items-center justify-center">
                <Spinner size="xs" />
              </div>
            ) : (
              <div className="flex flex-col gap-4 pt-2">
                <div>
                  <Label htmlFor="feedback-content" className="mb-2 block">
                    {thumbDirection === "down"
                      ? "What should the agent do differently?"
                      : "Glad you liked it! Tell us more?"}
                  </Label>

                  {thumbDirection === "down" && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {showPredefinedAnswers &&
                        FEEDBACK_PREDEFINED_ANSWERS.map((answer) => (
                          <Button
                            key={answer}
                            label={answer}
                            size="xs"
                            variant={
                              selectedAnswerField.field.value === answer
                                ? "primary"
                                : "outline"
                            }
                            onClick={() => {
                              selectedAnswerField.field.onChange(
                                selectedAnswerField.field.value === answer
                                  ? ""
                                  : answer
                              );
                            }}
                          />
                        ))}
                    </div>
                  )}

                  <TextArea
                    id="feedback-content"
                    placeholder={
                      thumbDirection === "down"
                        ? "Describe what went wrong"
                        : "Share details"
                    }
                    resize="vertical"
                    rows={3}
                    value={feedbackContentField.field.value}
                    onChange={(e) =>
                      feedbackContentField.field.onChange(e.target.value)
                    }
                    error={
                      feedbackContentField.fieldState.error?.message ?? null
                    }
                    showErrorLabel={!!feedbackContentField.fieldState.error}
                  />
                </div>

                <div className="flex items-start gap-2">
                  <Checkbox
                    id="share-conversation"
                    checked={isConversationSharedField.field.value}
                    onCheckedChange={(value) => {
                      isConversationSharedField.field.onChange(!!value);
                    }}
                    size="xs"
                    className="mt-1"
                  />
                  <div className="flex flex-col">
                    <Label htmlFor="share-conversation">
                      Share conversation with the agent’s editors
                    </Label>
                    <span className="text-xs text-muted-foreground">
                      Helps editors improve the agent
                    </span>
                  </div>
                </div>

                <FeedbackSelectorPopoverContent
                  owner={owner}
                  agentConfigurationId={agentConfigurationId}
                  isGlobalAgent={isGlobalAgent}
                />
              </div>
            )}
          </DialogContainer>

          <DialogFooter
            rightButtonProps={{
              label: "Submit",
              variant: "primary",
              onClick: handleSubmit,
              disabled: isSubmittingThumb,
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
